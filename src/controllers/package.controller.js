import mongoose from 'mongoose';
import crypto from 'crypto';
import { createRequire } from 'module';
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

const require = createRequire(import.meta.url);
const archiver = require('archiver');
const unzipper = require('unzipper');

const packageSchema = z.object({
  name: z.string().optional().default(''),
  description: z.string().optional().default(''),
  editorMode: z.enum(['draw', 'text']).optional().default('draw'),
});

const EXPORT_SCHEMA = 'plashcard-package-export';
const EXPORT_VERSION = 2;
const ASSET_REF_TYPE = 'asset';
const MAX_IMPORT_ASSET_BYTES = 25 * 1024 * 1024;

function safeExportFileName(value = '') {
  return String(value || 'flashcard-package')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'flashcard-package';
}

function asciiHeaderFileName(value = '') {
  return safeExportFileName(value)
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]+/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'flashcard-package';
}

function contentDispositionAttachment(fileName) {
  const utf8Name = `${safeExportFileName(fileName)}.zip`;
  const asciiName = `${asciiHeaderFileName(fileName)}.zip`;

  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(utf8Name)}`;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function extensionFromMimeType(mimeType = '') {
  const normalized = String(mimeType).toLowerCase();

  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/gif') return 'gif';
  if (normalized === 'image/svg+xml') return 'svg';

  return 'bin';
}

function isZipPackage(file = {}) {
  const name = String(file.originalname || '').toLowerCase();
  const mimeType = String(file.mimetype || '').toLowerCase();

  return (
    name.endsWith('.zip') ||
    mimeType === 'application/zip' ||
    mimeType === 'application/x-zip-compressed'
  );
}

function isAssetReference(value) {
  return (
    value &&
    typeof value === 'object' &&
    value.type === ASSET_REF_TYPE &&
    typeof value.path === 'string'
  );
}

function parseDataUrlImage(value = '') {
  const match = String(value).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function isAllowedImportImageUrl(value = '') {
  try {
    const url = new URL(String(value));
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'res.cloudinary.com' ||
        url.hostname.endsWith('.cloudinary.com'))
    );
  } catch {
    return false;
  }
}

function isHttpUrl(value = '') {
  try {
    const url = new URL(String(value));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function fetchImportImage(value = '') {
  const dataUrlImage = parseDataUrlImage(value);
  if (dataUrlImage) return dataUrlImage;

  if (!String(value || '').trim()) return null;

  if (!isAllowedImportImageUrl(value)) {
    if (isHttpUrl(value)) {
      throw new Error('Only Cloudinary image URLs are allowed in package imports');
    }

    return null;
  }

  const response = await fetch(value);

  if (!response.ok) {
    throw new Error(`Cannot copy imported image: ${response.status}`);
  }

  const mimeType = response.headers.get('content-type')?.split(';')[0] || '';

  if (!mimeType.startsWith('image/')) {
    throw new Error('Imported image URL is not an image');
  }

  const contentLength = Number(response.headers.get('content-length'));
  const maxBytes = 25 * 1024 * 1024;

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error('Imported image is too large');
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length > maxBytes) {
    throw new Error('Imported image is too large');
  }

  return {
    mimeType,
    buffer,
  };
}

async function collectPackageAsset(value, assetsBySource, assetsById) {
  if (isAssetReference(value)) return value;

  const source = typeof value === 'string' ? value.trim() : '';
  if (!source) return value;

  const image = await fetchImportImage(source);
  if (!image) return value;

  const hash = sha256(image.buffer);
  const assetId = `sha256-${hash}`;
  const extension = extensionFromMimeType(image.mimeType);
  const assetPath = `assets/${assetId}.${extension}`;

  if (!assetsById.has(assetId)) {
    assetsById.set(assetId, {
      id: assetId,
      path: assetPath,
      mimeType: image.mimeType,
      size: image.buffer.length,
      buffer: image.buffer,
    });
  }

  const ref = {
    type: ASSET_REF_TYPE,
    assetId,
    path: assetPath,
    mimeType: image.mimeType,
    size: image.buffer.length,
  };

  if (isHttpUrl(source)) {
    ref.originalUrl = source;
  }

  assetsBySource.set(source, ref);
  return ref;
}

async function referencePackageAsset(value, assetsBySource, assetsById) {
  const source = typeof value === 'string' ? value.trim() : '';

  if (source && assetsBySource.has(source)) {
    return assetsBySource.get(source);
  }

  return collectPackageAsset(value, assetsBySource, assetsById);
}

async function referenceCanvasDataAssets(canvasData, assetsBySource, assetsById) {
  const actions = parseCanvasActions(canvasData);
  if (actions.length === 0) return null;

  const nextActions = [];

  for (const action of actions) {
    const clonedAction = { ...action };

    if (action?.type === 'image' && action.dataUrl) {
      const assetRef = await referencePackageAsset(
        action.dataUrl,
        assetsBySource,
        assetsById,
      );

      if (isAssetReference(assetRef)) {
        clonedAction.asset = assetRef;
        clonedAction.originalDataUrl = action.dataUrl;
        delete clonedAction.dataUrl;
      }
    }

    nextActions.push(clonedAction);
  }

  return JSON.stringify(nextActions);
}

async function buildExportPackagePayload(pkg, cards) {
  const assetsBySource = new Map();
  const assetsById = new Map();
  const exportedCards = [];

  for (const card of cards) {
    const cardPayload = card.toPairClient();

    for (const side of ['front', 'back']) {
      const sidePayload = { ...(cardPayload[side] || {}) };

      sidePayload.content = await referencePackageAsset(
        sidePayload.content,
        assetsBySource,
        assetsById,
      );

      const canvasData = await referenceCanvasDataAssets(
        sidePayload.canvasData,
        assetsBySource,
        assetsById,
      );

      if (canvasData) {
        sidePayload.canvasData = canvasData;
      }

      cardPayload[side] = sidePayload;
    }

    exportedCards.push(cardPayload);
  }

  const assets = [...assetsById.values()];

  return {
    manifest: {
      schema: EXPORT_SCHEMA,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      dataFile: 'data.json',
      assetCount: assets.length,
      assets: assets.map(({ buffer, ...asset }) => asset),
    },
    data: {
      schema: EXPORT_SCHEMA,
      version: EXPORT_VERSION,
      package: {
        name: pkg.name || '',
        description: pkg.description || '',
        backgroundPairId: pkg.backgroundPairId || '1',
      },
      cards: exportedCards,
    },
    assets,
  };
}

async function writeExportZip(res, { manifest, data, assets }) {
  const archive = new archiver.ZipArchive({ zlib: { level: 9 } });

  const finished = new Promise((resolve, reject) => {
    archive.on('error', reject);
    res.on('finish', resolve);
    res.on('close', resolve);
  });

  archive.pipe(res);
  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
  archive.append(JSON.stringify(data, null, 2), { name: 'data.json' });

  for (const asset of assets) {
    archive.append(asset.buffer, { name: asset.path });
  }

  await archive.finalize();
  await finished;
}

async function parseZipPackage(buffer) {
  const directory = await unzipper.Open.buffer(buffer);
  const entries = new Map(directory.files.map((entry) => [entry.path, entry]));
  const manifestEntry = entries.get('manifest.json');
  const dataEntry = entries.get('data.json');

  if (!manifestEntry || !dataEntry) {
    throw new Error('Invalid package archive: missing manifest.json or data.json');
  }

  const manifest = JSON.parse((await manifestEntry.buffer()).toString('utf8'));
  const data = JSON.parse((await dataEntry.buffer()).toString('utf8'));

  if (manifest?.schema !== EXPORT_SCHEMA || Number(manifest?.version) !== EXPORT_VERSION) {
    throw new Error('Unsupported package archive version');
  }

  const assetFiles = new Map();
  const manifestAssets = Array.isArray(manifest.assets) ? manifest.assets : [];

  for (const asset of manifestAssets) {
    const assetPath = String(asset?.path || '');

    if (!assetPath.startsWith('assets/') || assetPath.includes('..')) {
      throw new Error('Invalid asset path in package archive');
    }

    const entry = entries.get(assetPath);
    if (!entry) {
      throw new Error(`Missing asset file: ${assetPath}`);
    }

    const assetBuffer = await entry.buffer();

    if (assetBuffer.length > MAX_IMPORT_ASSET_BYTES) {
      throw new Error(`Imported image is too large: ${assetPath}`);
    }

    const expectedAssetId = String(asset.assetId || asset.id || '');
    const actualAssetId = `sha256-${sha256(assetBuffer)}`;

    if (expectedAssetId && expectedAssetId !== actualAssetId) {
      throw new Error(`Asset checksum mismatch: ${assetPath}`);
    }

    assetFiles.set(assetPath, {
      buffer: assetBuffer,
      mimeType: String(asset.mimeType || 'application/octet-stream'),
      originalname: assetPath.split('/').pop() || 'asset',
    });
  }

  return { payload: data, assetFiles };
}

async function resolveImportImage(value, assetFiles = null) {
  if (isAssetReference(value)) {
    const asset = assetFiles?.get(value.path);
    if (!asset) {
      throw new Error(`Missing imported image asset: ${value.path}`);
    }

    if (!asset.mimeType.startsWith('image/')) {
      throw new Error('Imported asset is not an image');
    }

    return {
      buffer: asset.buffer,
      mimeType: asset.mimeType,
      originalname: asset.originalname,
    };
  }

  return fetchImportImage(value);
}

function getTempImportSideName(side) {
  return side === 'back' ? 'cardback' : 'cardfront';
}

function getImportPairs(payload = {}) {
  const rawCards = Array.isArray(payload?.cards)
    ? payload.cards
    : Array.isArray(payload)
      ? payload
      : [];
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

    if (card?.front || card?.back) {
      pair.front = card.front || pair.front;
      pair.back = card.back || pair.back;
      return;
    }

    const side = card?.side === 'back' || String(card?.id || '').endsWith('_back')
      ? 'back'
      : 'front';

    pair[side] = {
      pairId: localId,
      side,
      content: card?.content || '',
      canvasData: card?.canvasData || null,
    };
  });

  return [...pairs.values()];
}

function parseCanvasActions(canvasData) {
  if (!canvasData) return [];
  if (Array.isArray(canvasData)) return canvasData;

  try {
    const parsed = JSON.parse(canvasData);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function cloneCanvasDataImages({
  canvasData,
  folder,
  side,
  uploadPublicIds,
  assetFiles = null,
}) {
  const actions = parseCanvasActions(canvasData);

  if (actions.length === 0) return null;

  const clonedActions = [];

  for (const [index, action] of actions.entries()) {
    const clonedAction = { ...action };

    if (action?.type === 'image' && (action.dataUrl || action.asset)) {
      const image = await resolveImportImage(action.asset || action.dataUrl, assetFiles);

      if (image) {
        const uploadResult = await uploadImageBuffer(
          {
            buffer: image.buffer,
            mimetype: image.mimeType,
            originalname: image.originalname || `${side}-layer-${index}.png`,
          },
          {
            folder,
            asset_folder: folder,
            public_id: `${side}-layer-${index}`,
          },
        );

        uploadPublicIds.push(uploadResult.public_id);
        clonedAction.dataUrl = uploadResult.secure_url;
        delete clonedAction.asset;
        delete clonedAction.originalDataUrl;
      }
    }

    clonedActions.push(clonedAction);
  }

  return JSON.stringify(clonedActions);
}

async function cleanupTempImport(packageIds = [], publicIds = []) {
  await destroyPublicIds(publicIds);
  await Card.deleteMany({ packageId: { $in: packageIds } });
  await Package.deleteMany({ _id: { $in: packageIds } });
}

export const exportPackage = asyncHandler(async (req, res) => {
  const pkg = await Package.findOne({
    _id: req.params.packageId,
    userId: req.user._id,
    deletedAt: null,
  });

  if (!pkg) {
    return res.status(404).json({
      success: false,
      message: 'Package not found',
    });
  }

  const cards = await Card.find({
    userId: req.user._id,
    packageId: req.params.packageId,
  }).sort({ sortOrder: 1, createdAt: 1 });

  const payload = await buildExportPackagePayload(pkg, cards);
  const fileName = pkg.name || pkg._id.toString();

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', contentDispositionAttachment(fileName));
  res.setHeader('Cache-Control', 'no-store');

  await writeExportZip(res, payload);
});

export const importPackage = asyncHandler(async (req, res) => {
  const file = Array.isArray(req.files) ? req.files[0] : req.file;

  if (!file) {
    return res.status(400).json({
      success: false,
      message: 'Please choose a JSON or ZIP file',
    });
  }

  const createdPackageIds = [];
  const uploadedPublicIds = [];

  try {
    const parsedPackage = isZipPackage(file)
      ? await parseZipPackage(file.buffer)
      : { payload: JSON.parse(file.buffer.toString('utf8')), assetFiles: null };
    const { payload, assetFiles } = parsedPackage;
    const packageData = payload?.package || {};
    const pkg = await Package.create({
      userId: req.user._id,
      name: `${String(
        packageData.name ||
          file.originalname?.replace(/\.(json|zip)$/i, '') ||
          'Imported package',
      ).trim()} (import)`,
      description: String(packageData.description || '').trim(),
      backgroundPairId: String(packageData.backgroundPairId || '1'),
      editorMode: packageData.editorMode === 'text' ? 'text' : 'draw',
    });

    createdPackageIds.push(pkg._id);

    const pairs = getImportPairs(payload);
    const docs = [];

    for (const [index, pair] of pairs.entries()) {
      const cardMongoId = new mongoose.Types.ObjectId();
      const folder = getCardImageFolder(
        req.user._id.toString(),
        pkg._id.toString(),
        cardMongoId.toString(),
      );
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
        const sourceSide = pair[side] || {};
        const clonedSide = {
          pairId: pair.localId,
          side,
        };
        const image = await resolveImportImage(sourceSide.content, assetFiles);

        if (image) {
          const uploadResult = await uploadImageBuffer(
            {
              buffer: image.buffer,
              mimetype: image.mimeType,
              originalname: image.originalname || `${pair.localId}-${side}.png`,
            },
            {
              folder,
              asset_folder: folder,
              public_id: getTempImportSideName(side),
            },
          );

          uploadedPublicIds.push(uploadResult.public_id);
          clonedSide.content = uploadResult.secure_url;
          clonedSide.contentPublicId = uploadResult.public_id;
        } else {
          clonedSide.content = '';
        }

        const clonedCanvasData = await cloneCanvasDataImages({
          canvasData: sourceSide.canvasData,
          folder,
          side,
          uploadPublicIds: uploadedPublicIds,
          assetFiles,
        });

        if (clonedCanvasData) {
          clonedSide.canvasData = clonedCanvasData;
        }

        cardDoc[side] = clonedSide;
      }

      docs.push(cardDoc);
    }

    if (docs.length > 0) {
      await Card.insertMany(docs);
    }

    return created(
      res,
      {
        id: pkg._id.toString(),
        package: pkg.toClient(),
        cardPairCount: docs.length,
      },
      'Package imported',
    );
  } catch (error) {
    await cleanupTempImport(createdPackageIds, uploadedPublicIds);
    throw error;
  }
});

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
    editorMode: body.editorMode || 'draw',
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
        editorMode: packageData.editorMode === 'text' ? 'text' : 'draw',
      });

      createdPackageIds.push(pkg._id);

      const pairs = getImportPairs(payload);
      const docs = [];

      for (const [index, pair] of pairs.entries()) {
        const cardMongoId = new mongoose.Types.ObjectId();
        const folder = getCardImageFolder(
          req.user._id.toString(),
          pkg._id.toString(),
          cardMongoId.toString(),
        );
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
          const sourceSide = pair[side] || {};
          const sidePayload = {
            pairId: pair.localId,
            side,
          };
          const image = await fetchImportImage(sourceSide.content);

          if (image) {
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
            sidePayload.content = uploadResult.secure_url;
            sidePayload.contentPublicId = uploadResult.public_id;
          } else {
            sidePayload.content = '';
          }

          const clonedCanvasData = await cloneCanvasDataImages({
            canvasData: sourceSide.canvasData,
            folder,
            side,
            uploadPublicIds: uploadedPublicIds,
          });

          if (clonedCanvasData) {
            sidePayload.canvasData = clonedCanvasData;
          }

          cardDoc[side] = sidePayload;
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
