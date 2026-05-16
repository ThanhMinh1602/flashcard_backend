import Package from '../models/Package.js';
import Card from '../models/Card.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';

async function ensurePackage(userId, packageId) {
  return Package.findOne({ _id: packageId, userId });
}

function parseSideDocId(sideDocId = '') {
  const match = String(sideDocId).match(/^(.*)_(front|back)$/);
  return {
    localId: match ? match[1] : String(sideDocId),
    side: match ? match[2] : 'unknown',
  };
}

export const saveCardSide = asyncHandler(async (req, res) => {
  const pkg = await ensurePackage(req.user._id, req.params.packageId);
  if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });

  const sideDocId = req.params.sideDocId;
  const { localId, side } = parseSideDocId(sideDocId);
  const payload = { ...req.body };
  delete payload.userId;
  delete payload.packageId;
  delete payload.createdAt;
  delete payload.updatedAt;

  const card = await Card.findOneAndUpdate(
    { userId: req.user._id, packageId: req.params.packageId, sideDocId },
    { userId: req.user._id, packageId: req.params.packageId, sideDocId, localId, side, data: payload },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return ok(res, card.toClient(), 'Card saved');
});

export const getFlashcards = asyncHandler(async (req, res) => {
  const pkg = await ensurePackage(req.user._id, req.params.packageId);
  if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });

  const cards = await Card.find({ userId: req.user._id, packageId: req.params.packageId }).sort({ updatedAt: 1 });
  return ok(res, cards.map((item) => item.toClient()));
});

export const deleteFlashcardPair = asyncHandler(async (req, res) => {
  const pkg = await ensurePackage(req.user._id, req.params.packageId);
  if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });

  await Card.deleteMany({
    userId: req.user._id,
    packageId: req.params.packageId,
    sideDocId: { $in: [`${req.params.localId}_front`, `${req.params.localId}_back`] },
  });

  return ok(res, null, 'Card pair deleted');
});
