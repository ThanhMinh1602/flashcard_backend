import Background from '../models/Background.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok } from '../utils/response.js';
import {
  deleteFolderIfEmpty,
  deleteImagesByPrefix,
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

function makeFolderName(value, fallback = 'background') {
  return (
    String(value || fallback)
      .trim()
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'background'
  );
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

export const getBackgrounds = asyncHandler(async (_req, res) => {
  const backgrounds = await Background.find().sort({ createdAt: -1 });

  return ok(res, backgrounds.map((background) => background.toClient()));
});

export const uploadBackground = asyncHandler(async (req, res) => {
  const frontFile = getUploadedFile(req, 'frontBackground');
  const backFile = getUploadedFile(req, 'backBackground');
  const name = String(req.body?.name || '').trim();

  if (!frontFile || !backFile) {
    return res.status(400).json({
      success: false,
      message: 'Both front and back background images are required',
    });
  }

  if (!name) {
    return res.status(400).json({
      success: false,
      message: 'Background name is required',
    });
  }

  const folderName = makeFolderName(name);
  const existedBackground = await Background.findOne({ folderName });

  if (existedBackground) {
    return res.status(409).json({
      success: false,
      message: 'Background folder name already exists',
    });
  }

  const [frontResult, backResult] = await Promise.all([
    uploadBackgroundSide(frontFile, 'front', folderName),
    uploadBackgroundSide(backFile, 'back', folderName),
  ]);

  const background = await Background.create({
    name,
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
  const nextName = String(req.body?.name || '').trim();
  const oldPublicIds = [];
  const hasNewFile = Boolean(frontFile || backFile);
  const replacingBothSides = Boolean(frontFile && backFile);
  const targetName = nextName || background.name || makeSafeName(frontFile || backFile);
  const oldFolderName = background.folderName || '';
  const currentFolderName =
    oldFolderName || makeFolderName(background.name || targetName);
  const targetFolderName =
    replacingBothSides && targetName
      ? makeFolderName(targetName)
      : currentFolderName;
  const oldFolderPath = background.folderName
    ? getBackgroundFolder(background.folderName)
    : '';

  if (nextName) {
    background.name = nextName;
  }

  if (hasNewFile && targetFolderName !== background.folderName) {
    const existedBackground = await Background.findOne({
      _id: { $ne: background._id },
      folderName: targetFolderName,
    });

    if (existedBackground) {
      return res.status(409).json({
        success: false,
        message: 'Background folder name already exists',
      });
    }
  }

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

  if (background.folderName) {
    const folderPath = getBackgroundFolder(background.folderName);
    await deleteImagesByPrefix(folderPath);
    await deleteFolderIfEmpty(folderPath);
  } else {
    await destroyPublicIds(getBackgroundPublicIds(background));
  }
  await background.deleteOne();

  return ok(res, null, 'Background deleted');
});
