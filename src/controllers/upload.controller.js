import cloudinary from '../config/cloudinary.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';

const uploadBufferToCloudinary = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      },
    );

    stream.end(buffer);
  });
};

export const uploadCardImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Image file is required',
    });
  }

  const folder = process.env.CLOUDINARY_FOLDER || 'flashcard';

  const result = await uploadBufferToCloudinary(req.file.buffer, folder);

  return ok(
    res,
    {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
    },
    'Image uploaded successfully',
  );
});

export const deleteCardImage = asyncHandler(async (req, res) => {
  const { publicId } = req.body;

  if (!publicId) {
    return res.status(400).json({
      success: false,
      message: 'publicId is required',
    });
  }

  await cloudinary.uploader.destroy(publicId);

  return ok(res, null, 'Image deleted successfully');
});
