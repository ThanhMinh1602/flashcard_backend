import Background from '../models/Background.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok } from '../utils/response.js';
import {
  getSystemBackgroundsFolder,
  uploadImageBuffer,
} from '../services/cloudinary.service.js';

export const getBackgrounds = asyncHandler(async (_req, res) => {
  const backgrounds = await Background.find().sort({ createdAt: -1 });

  return ok(res, backgrounds.map((background) => background.toClient()));
});

export const uploadBackground = asyncHandler(async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({
      success: false,
      message: 'Background image is required',
    });
  }

  const timestamp = Date.now();
  const safeName = String(file.originalname || 'background')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'background';

  const result = await uploadImageBuffer(file, {
    folder: getSystemBackgroundsFolder(),
    asset_folder: getSystemBackgroundsFolder(),
    public_id: `${timestamp}-${safeName}`,
  });

  const background = await Background.create({
    name: req.body?.name || safeName,
    url: result.secure_url,
    publicId: result.public_id,
    createdBy: req.user._id,
  });

  return created(res, background.toClient(), 'Background uploaded');
});
