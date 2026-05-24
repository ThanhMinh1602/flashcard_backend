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
} from '../services/cloudinary.service.js';

const packageSchema = z.object({
  name: z.string().optional().default(''),
  description: z.string().optional().default(''),
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
    backgroundPairId: '1',
  });
  return created(res, { id: pkg._id.toString(), package: pkg.toClient() });
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
  const pkg = await Package.findOneAndDelete({
    _id: req.params.packageId,
    userId: req.user._id,
    deletedAt: { $ne: null },
  });

  if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });

  const cards = await Card.find({
    userId: req.user._id,
    packageId: req.params.packageId,
  }).select('_id');

  await Promise.all(
    cards.map(async (card) => {
      const cardFolder = getCardImageFolder(
        req.user._id.toString(),
        req.params.packageId,
        card._id.toString(),
      );

      await deleteImagesByPrefix(cardFolder);
      await deleteFolderIfEmpty(cardFolder);
    }),
  );
  await deleteFolderIfEmpty(
    getPackageImageFolder(req.user._id.toString(), req.params.packageId),
  );

  await Card.deleteMany({ userId: req.user._id, packageId: req.params.packageId });
  return ok(res, null, 'Package permanently deleted');
});
