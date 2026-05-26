import mongoose from 'mongoose';
import Background from '../models/Background.js';
import Card from '../models/Card.js';
import Package from '../models/Package.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok } from '../utils/response.js';
import {
  deleteFolderIfEmpty,
  deleteImagesByPrefix,
  destroyPublicIds,
  getSystemBackgroundsFolder,
  uploadImageBuffer,
} from '../services/cloudinary.service.js';

const DEFAULT_BACKGROUND_PAIR_ID = '1';

function getUploadedFile(req, fieldName) {
  return Array.isArray(req.files?.[fieldName]) ? req.files[fieldName][0] : null;
}

function getBackgroundBaseFolder() {
  return getSystemBackgroundsFolder();
}

function getBackgroundFolder(folderName) {
  return `${getBackgroundBaseFolder()}/${folderName}`;
}

async function uploadBackgroundSide(file, side, folderName) {
  const folder = getBackgroundFolder(folderName);
  const publicId = side === 'front' ? 'cardfront_image' : 'cardback_image';

  return uploadImageBuffer(file, {
    folder,
    asset_folder: folder,
    public_id: publicId,
    overwrite: true,
  });
}

function getBackgroundPublicIds(background) {
  return [
    background.frontPublicId,
    background.backPublicId,
    background.publicId,
  ].filter(Boolean);
}

async function replaceDeletedBackgroundReferences(backgroundId, fallbackBackgroundPairId) {
  const rawBackgroundId = backgroundId.toString();
  const deletedBackgroundPairIds = [`system-${rawBackgroundId}`, rawBackgroundId];

  await Promise.all([
    Package.updateMany(
      { backgroundPairId: { $in: deletedBackgroundPairIds } },
      { $set: { backgroundPairId: fallbackBackgroundPairId } },
    ),
    Card.updateMany(
      { 'front.backgroundPairId': { $in: deletedBackgroundPairIds } },
      { $set: { 'front.backgroundPairId': fallbackBackgroundPairId } },
    ),
    Card.updateMany(
      { 'back.backgroundPairId': { $in: deletedBackgroundPairIds } },
      { $set: { 'back.backgroundPairId': fallbackBackgroundPairId } },
    ),
  ]);
}

export const getBackgrounds = asyncHandler(async (_req, res) => {
  const backgrounds = await Background.find().sort({ createdAt: -1 });

  return ok(res, backgrounds.map((background) => background.toClient()));
});

export const uploadBackground = asyncHandler(async (req, res) => {
  const frontFile = getUploadedFile(req, 'frontBackground');
  const backFile = getUploadedFile(req, 'backBackground');

  if (!frontFile || !backFile) {
    return res.status(400).json({
      success: false,
      message: 'Both front and back background images are required',
    });
  }

  const backgroundId = new mongoose.Types.ObjectId();
  const folderName = backgroundId.toString();

  const [frontResult, backResult] = await Promise.all([
    uploadBackgroundSide(frontFile, 'front', folderName),
    uploadBackgroundSide(backFile, 'back', folderName),
  ]);

  const background = await Background.create({
    _id: backgroundId,
    folderName,
    url: frontResult.secure_url,
    publicId: frontResult.public_id,
    frontUrl: frontResult.secure_url,
    backUrl: backResult.secure_url,
    frontPublicId: frontResult.public_id,
    backPublicId: backResult.public_id,
    createdBy: req.user._id,
  });

  return created(res, background.toClient(), 'Background uploaded');
});

export const updateBackground = asyncHandler(async (req, res) => {
  const background = await Background.findById(req.params.backgroundId);

  if (!background) {
    return res.status(404).json({
      success: false,
      message: 'Background not found',
    });
  }

  const frontFile = getUploadedFile(req, 'frontBackground');
  const backFile = getUploadedFile(req, 'backBackground');
  const oldPublicIds = [];
  const hasNewFile = Boolean(frontFile || backFile);
  const oldFolderName = background.folderName || '';
  const targetFolderName = oldFolderName || background._id.toString();
  const oldFolderPath = background.folderName
    ? getBackgroundFolder(background.folderName)
    : '';

  if (frontFile) {
    oldPublicIds.push(background.frontPublicId || background.publicId);
    const result = await uploadBackgroundSide(frontFile, 'front', targetFolderName);

    background.url = result.secure_url;
    background.publicId = result.public_id;
    background.frontUrl = result.secure_url;
    background.frontPublicId = result.public_id;
  }

  if (backFile) {
    oldPublicIds.push(background.backPublicId || background.publicId);
    const result = await uploadBackgroundSide(backFile, 'back', targetFolderName);

    background.backUrl = result.secure_url;
    background.backPublicId = result.public_id;
  }

  if (hasNewFile) {
    background.folderName = targetFolderName;
  }

  await background.save();

  await destroyPublicIds(
    oldPublicIds.filter(
      (publicId) =>
        publicId &&
        publicId !== background.frontPublicId &&
        publicId !== background.backPublicId,
    ),
  );

  if (oldFolderPath && targetFolderName !== oldFolderName) {
    await deleteFolderIfEmpty(oldFolderPath);
  }

  return ok(res, background.toClient(), 'Background updated');
});

export const deleteBackground = asyncHandler(async (req, res) => {
  const background = await Background.findById(req.params.backgroundId);

  if (!background) {
    return res.status(404).json({
      success: false,
      message: 'Background not found',
    });
  }

  const fallbackBackgroundPairId = DEFAULT_BACKGROUND_PAIR_ID;
  await replaceDeletedBackgroundReferences(background._id, fallbackBackgroundPairId);

  if (background.folderName) {
    const folderPath = getBackgroundFolder(background.folderName);
    await deleteImagesByPrefix(folderPath);
    await deleteFolderIfEmpty(folderPath);
  } else {
    await destroyPublicIds(getBackgroundPublicIds(background));
  }
  await background.deleteOne();

  return ok(res, { fallbackBackgroundPairId }, 'Background deleted');
});
