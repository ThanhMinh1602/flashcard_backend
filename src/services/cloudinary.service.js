import cloudinary from '../config/cloudinary.js';

function ensureCloudinaryConfig() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  const config = cloudinary.config();

  if (!config.cloud_name || !config.api_key || !config.api_secret) {
    throw new Error('Missing Cloudinary configuration');
  }
}

const CLOUDINARY_RETRY_DELAYS = [700, 1400, 2800, 5600];

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function shouldRetryCloudinaryDelete(error) {
  const message = String(error?.message || '').toLowerCase();

  return (
    error?.http_code === 420 ||
    error?.http_code === 429 ||
    message.includes('too many concurrent') ||
    message.includes('rate limit')
  );
}

async function withCloudinaryDeleteRetry(operation) {
  let lastError;

  for (let attempt = 0; attempt <= CLOUDINARY_RETRY_DELAYS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!shouldRetryCloudinaryDelete(error) || attempt === CLOUDINARY_RETRY_DELAYS.length) {
        throw error;
      }

      await wait(CLOUDINARY_RETRY_DELAYS[attempt]);
    }
  }

  throw lastError;
}

export function getCardImageFolder(userId, packageId, cardId) {
  const rootFolder = process.env.CLOUDINARY_ROOT_FOLDER || 'flashcard';
  const userFolder = process.env.CLOUDINARY_USERS_FOLDER || 'users';
  const packageFolder = String(packageId);

  return `${rootFolder}/${userFolder}/${userId}/${packageFolder}/${cardId}`;
}

export function getPackageImageFolder(userId, packageId) {
  const rootFolder = process.env.CLOUDINARY_ROOT_FOLDER || 'flashcard';
  const userFolder = process.env.CLOUDINARY_USERS_FOLDER || 'users';
  const packageFolder = String(packageId);

  return `${rootFolder}/${userFolder}/${userId}/${packageFolder}`;
}

export function getSystemBackgroundsFolder() {
  const rootFolder = process.env.CLOUDINARY_ROOT_FOLDER || 'flashcard';
  const backgroundsFolder =
    process.env.CLOUDINARY_BACKGROUNDS_FOLDER || 'backgrounds';

  return `${rootFolder}/${backgroundsFolder}`;
}

export function uploadImageBuffer(file, options = {}) {
  ensureCloudinaryConfig();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'image',
        overwrite: true,
        ...options,
      },
      (error, result) => {
        if (error) return reject(error);
        return resolve(result);
      },
    );

    stream.end(file.buffer);
  });
}

export async function destroyPublicIds(publicIds = []) {
  const ids = [...new Set(publicIds.filter(Boolean))];
  if (ids.length === 0) return;

  ensureCloudinaryConfig();

  for (const publicId of ids) {
    await withCloudinaryDeleteRetry(() =>
      cloudinary.uploader.destroy(publicId, {
        resource_type: 'image',
        invalidate: true,
      }),
    );
  }
}

export async function deleteImagesByPrefix(prefix) {
  ensureCloudinaryConfig();

  if (!prefix) return;

  try {
    await withCloudinaryDeleteRetry(() =>
      cloudinary.api.delete_resources_by_prefix(prefix, {
        resource_type: 'image',
        invalidate: true,
      }),
    );
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();

    if (error?.http_code === 404 || message.includes('not found')) {
      return;
    }

    throw error;
  }
}

export async function deleteFolderIfEmpty(folderPath) {
  ensureCloudinaryConfig();

  if (!folderPath) return;

  try {
    await cloudinary.api.delete_folder(folderPath);
  } catch (error) {
    console.warn(
      `Cloudinary folder cleanup skipped for "${folderPath}": ${error.message}`,
    );
  }
}
