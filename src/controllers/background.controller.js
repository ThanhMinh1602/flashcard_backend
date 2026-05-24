import Background from '../models/Background.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok } from '../utils/response.js';
import {
  destroyPublicIds,
  getSystemBackgroundsFolder,
  uploadImageBuffer,
} from '../services/cloudinary.service.js';

function getUploadedFile(req, fieldName) {
  return Array.isArray(req.files?.[fieldName]) ? req.files[fieldName][0] : null;
}

function makeSafeName(file, fallback = 'background') {
  return (
    String(file?.originalname || fallback)
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'background'
  );
}

async function uploadBackgroundSide(file, side, fallbackName) {
  const timestamp = Date.now();
  const safeName = makeSafeName(file, fallbackName);
  const folder = getSystemBackgroundsFolder();

  return uploadImageBuffer(file, {
    folder,
    asset_folder: folder,
    public_id: `${timestamp}-${side}-${safeName}`,
  });
}

function getBackgroundPublicIds(background) {
  return [
    background.frontPublicId,
    background.backPublicId,
    background.publicId,
  ].filter(Boolean);
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

  const [frontResult, backResult] = await Promise.all([
    uploadBackgroundSide(frontFile, 'front', 'background-front'),
    uploadBackgroundSide(backFile, 'back', 'background-back'),
  ]);

  const background = await Background.create({
    name: req.body?.name || makeSafeName(frontFile),
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
  const nextName = String(req.body?.name || '').trim();
  const oldPublicIds = [];

  if (nextName) {
    background.name = nextName;
  }

  if (frontFile) {
    oldPublicIds.push(background.frontPublicId || background.publicId);
    const result = await uploadBackgroundSide(
      frontFile,
      'front',
      background.name || 'background-front',
    );

    background.url = result.secure_url;
    background.publicId = result.public_id;
    background.frontUrl = result.secure_url;
    background.frontPublicId = result.public_id;
  }

  if (backFile) {
    oldPublicIds.push(background.backPublicId || background.publicId);
    const result = await uploadBackgroundSide(
      backFile,
      'back',
      background.name || 'background-back',
    );

    background.backUrl = result.secure_url;
    background.backPublicId = result.public_id;
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

  await destroyPublicIds(getBackgroundPublicIds(background));
  await background.deleteOne();

  return ok(res, null, 'Background deleted');
});
