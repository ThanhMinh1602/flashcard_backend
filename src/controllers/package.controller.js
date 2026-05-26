import mongoose from 'mongoose';
import { z } from 'zod';
import Package from '../models/Package.js';
import Card from '../models/Card.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok } from '../utils/response.js';
import {
  getCardImageFolder,
  getPackageImageFolder,
  deleteImagesByPrefix,
  deleteFolderIfEmpty,
  destroyPublicIds,
  uploadImageBuffer,
} from '../services/cloudinary.service.js';

const packageSchema = z.object({
  name: z.string().optional().default(''),
  description: z.string().optional().default(''),
});

function parseDataUrlImage(value = '') {
  const match = String(value).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function getTempImportSideName(side) {
  return side === 'back' ? 'cardback' : 'cardfront';
}

function getTempImportPairs(payload = {}) {
  const rawCards = Array.isArray(payload.cards) ? payload.cards : [];
  const pairs = new Map();

  rawCards.forEach((card) => {
    const localId = String(
      card?.pairId ||
        card?.localId ||
        String(card?.id || '').replace(/_(front|back)$/i, ''),
    ).trim();

    if (!localId) return;

    if (!pairs.has(localId)) {
      pairs.set(localId, {
        localId,
        sortOrder: Number.isFinite(Number(card?.sortOrder))
          ? Number(card.sortOrder)
          : pairs.size,
        front: {},
        back: {},
      });
    }

    const pair = pairs.get(localId);
    const side = card?.side === 'back' || String(card?.id || '').endsWith('_back')
      ? 'back'
      : 'front';

    pair[side] = {
      content: card?.content || '',
    };
  });

  return [...pairs.values()];
}

async function cleanupTempImport(packageIds = [], publicIds = []) {
  await destroyPublicIds(publicIds);
  await Card.deleteMany({ packageId: { $in: packageIds } });
  await Package.deleteMany({ _id: { $in: packageIds } });
}

export const getPackages = asyncHandler(async (req, res) => {
  const packages = await Package.find({
    userId: req.user._id,
    deletedAt: null,
  }).sort({ createdAt: -1 });
  return ok(res, packages.map((item) => item.toClient()));
});

export const getDeletedPackages = asyncHandler(async (req, res) => {
  const packages = await Package.find({
    userId: req.user._id,
    deletedAt: { $ne: null },
  }).sort({ deletedAt: -1 });

  return ok(res, packages.map((item) => item.toClient()));
});

export const createPackage = asyncHandler(async (req, res) => {
  const body = packageSchema.parse(req.body);
  const pkg = await Package.create({
    userId: req.user._id,
    name: body.name?.trim() || '',
    description: body.description?.trim() || '',
    backgroundPairId: '1',
  });
  return created(res, { id: pkg._id.toString(), package: pkg.toClient() });
});

export const importTempHsk4Packages = asyncHandler(async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];

  if (files.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Please choose at least one JSON file',
    });
  }

  const createdPackageIds = [];
  const uploadedPublicIds = [];
  const importedPackages = [];

  try {
    for (const file of files) {
      const payload = JSON.parse(file.buffer.toString('utf8'));
      const packageData = payload?.package || {};
      const pkg = await Package.create({
        userId: req.user._id,
        name:
          String(packageData.name || '').trim() ||
          String(file.originalname || '').replace(/\.json$/i, '') ||
          'HSK4 import',
        description: String(packageData.description || '').trim(),
        backgroundPairId: String(packageData.backgroundPairId || '1'),
      });

      createdPackageIds.push(pkg._id);

      const pairs = getTempImportPairs(payload);
      const docs = [];

      for (const [index, pair] of pairs.entries()) {
        const cardMongoId = new mongoose.Types.ObjectId();
        const cardDoc = {
          _id: cardMongoId,
          userId: req.user._id,
          packageId: pkg._id,
          localId: pair.localId,
          sideDocId: `${pair.localId}_pair`,
          front: {},
          back: {},
          sortOrder: Number.isFinite(Number(pair.sortOrder))
            ? Number(pair.sortOrder)
            : index,
        };

        for (const side of ['front', 'back']) {
          const image = parseDataUrlImage(pair[side]?.content);

          if (!image) continue;

          const folder = getCardImageFolder(
            req.user._id.toString(),
            pkg._id.toString(),
            cardMongoId.toString(),
          );
          const uploadResult = await uploadImageBuffer(
            {
              buffer: image.buffer,
              mimetype: image.mimeType,
              originalname: `${pair.localId}-${side}.png`,
            },
            {
              folder,
              asset_folder: folder,
              public_id: getTempImportSideName(side),
            },
          );

          uploadedPublicIds.push(uploadResult.public_id);
          cardDoc[side] = {
            pairId: pair.localId,
            side,
            content: uploadResult.secure_url,
            contentPublicId: uploadResult.public_id,
          };
        }

        docs.push(cardDoc);
      }

      if (docs.length > 0) {
        await Card.insertMany(docs);
      }

      importedPackages.push({
        package: pkg.toClient(),
        cardPairCount: docs.length,
      });
    }
  } catch (error) {
    await cleanupTempImport(createdPackageIds, uploadedPublicIds);
    throw error;
  }

  return created(
    res,
    {
      importedCount: importedPackages.length,
      packages: importedPackages,
    },
    'Temporary HSK4 packages imported',
  );
});

export const updatePackage = asyncHandler(async (req, res) => {
  const body = packageSchema.parse(req.body);
  const pkg = await Package.findOneAndUpdate(
    { _id: req.params.packageId, userId: req.user._id, deletedAt: null },
    { name: body.name?.trim() || '', description: body.description?.trim() || '' },
    { new: true }
  );
  if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });
  return ok(res, pkg.toClient());
});

export const updatePackageBackground = asyncHandler(async (req, res) => {
  const backgroundPairId = String(req.body.backgroundPairId || '1');
  const pkg = await Package.findOneAndUpdate(
    { _id: req.params.packageId, userId: req.user._id, deletedAt: null },
    { backgroundPairId },
    { new: true }
  );
  if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });
  return ok(res, pkg.toClient());
});

export const deletePackage = asyncHandler(async (req, res) => {
  const pkg = await Package.findOneAndUpdate(
    { _id: req.params.packageId, userId: req.user._id, deletedAt: null },
    { deletedAt: new Date() },
    { new: true }
  );
  if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });
  return ok(res, pkg.toClient(), 'Package moved to trash');
});

export const restorePackage = asyncHandler(async (req, res) => {
  const pkg = await Package.findOneAndUpdate(
    { _id: req.params.packageId, userId: req.user._id, deletedAt: { $ne: null } },
    { deletedAt: null },
    { new: true }
  );

  if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });
  return ok(res, pkg.toClient(), 'Package restored');
});

export const permanentlyDeletePackage = asyncHandler(async (req, res) => {
  const pkg = await Package.findOne({
    _id: req.params.packageId,
    userId: req.user._id,
    deletedAt: { $ne: null },
  });

  const cards = await Card.find({
    userId: req.user._id,
    packageId: req.params.packageId,
  }).select('_id');

  if (!pkg && cards.length === 0) {
    return res.status(404).json({ success: false, message: 'Package not found' });
  }

  for (const card of cards) {
    const cardFolder = getCardImageFolder(
      req.user._id.toString(),
      req.params.packageId,
      card._id.toString(),
    );

    await deleteImagesByPrefix(cardFolder);
    await deleteFolderIfEmpty(cardFolder);
  }
  await deleteFolderIfEmpty(
    getPackageImageFolder(req.user._id.toString(), req.params.packageId),
  );

  await Card.deleteMany({ userId: req.user._id, packageId: req.params.packageId });
  await Package.deleteOne({ _id: req.params.packageId, userId: req.user._id });
  return ok(res, null, 'Package permanently deleted');
});
