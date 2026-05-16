import Package from '../models/Package.js';
import Card from '../models/Card.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';

async function ensurePackage(userId, packageId) {
  return Package.findOne({
    _id: packageId,
    userId,
  });
}

function parseSideDocId(sideDocId = '') {
  const value = String(sideDocId);

  const match = value.match(/^(.*)_(front|back)$/);

  return {
    localId: match ? match[1] : value,
    side: match ? match[2] : 'front',
  };
}

function cleanPayload(body = {}) {
  const payload = { ...body };

  delete payload._id;
  delete payload.id;
  delete payload.userId;
  delete payload.packageId;
  delete payload.localId;
  delete payload.side;
  delete payload.sideDocId;
  delete payload.createdAt;
  delete payload.updatedAt;
  delete payload.__v;

  return payload;
}

// PUT /api/packages/:packageId/cards/:sideDocId
//
// Frontend vẫn gọi như cũ:
// - localId_front
// - localId_back
//
// Nhưng MongoDB sẽ lưu vào chung 1 document:
//
// {
//   localId,
//   front: {...},
//   back: {...}
// }
export const saveCardSide = asyncHandler(async (req, res) => {
  const pkg = await ensurePackage(req.user._id, req.params.packageId);

  if (!pkg) {
    return res.status(404).json({
      success: false,
      message: 'Package not found',
    });
  }

  const sideDocId = req.params.sideDocId;

  const { localId, side } = parseSideDocId(sideDocId);

  const payload = cleanPayload(req.body);

  const updateData = {
    userId: req.user._id,
    packageId: req.params.packageId,
    localId,
    sideDocId: `${localId}_pair`,
  };

  if (side === 'back') {
    updateData.back = payload;
  } else {
    updateData.front = payload;
  }

  const card = await Card.findOneAndUpdate(
    {
      userId: req.user._id,
      packageId: req.params.packageId,
      localId,
    },
    {
      $set: updateData,
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  );

  return ok(res, card.toSideClient(side), 'Card saved');
});

// GET /api/packages/:packageId/cards
//
// Để không làm vỡ UI cũ, API vẫn trả về dạng list side:
//
// [
//   { id: "abc_front", side: "front", ... },
//   { id: "abc_back", side: "back", ... }
// ]
//
// Nhưng trong MongoDB thực tế chỉ có 1 document cho cặp abc.
export const getFlashcards = asyncHandler(async (req, res) => {
  const pkg = await ensurePackage(req.user._id, req.params.packageId);

  if (!pkg) {
    return res.status(404).json({
      success: false,
      message: 'Package not found',
    });
  }

  const cards = await Card.find({
    userId: req.user._id,
    packageId: req.params.packageId,
  }).sort({
    updatedAt: 1,
  });

  const result = cards.flatMap((card) => {
    return [card.toSideClient('front'), card.toSideClient('back')];
  });

  return ok(res, result);
});

// GET dạng pair nếu sau này bạn muốn dùng UI mới.
// Hiện tại route này chưa gắn trong card.routes.js.
// Có thể dùng sau nếu muốn frontend làm việc trực tiếp với cặp thẻ.
export const getFlashcardPairs = asyncHandler(async (req, res) => {
  const pkg = await ensurePackage(req.user._id, req.params.packageId);

  if (!pkg) {
    return res.status(404).json({
      success: false,
      message: 'Package not found',
    });
  }

  const cards = await Card.find({
    userId: req.user._id,
    packageId: req.params.packageId,
  }).sort({
    updatedAt: 1,
  });

  return ok(
    res,
    cards.map((card) => card.toPairClient()),
  );
});

// DELETE /api/packages/:packageId/cards/pair/:localId
export const deleteFlashcardPair = asyncHandler(async (req, res) => {
  const pkg = await ensurePackage(req.user._id, req.params.packageId);

  if (!pkg) {
    return res.status(404).json({
      success: false,
      message: 'Package not found',
    });
  }

  await Card.deleteMany({
    userId: req.user._id,
    packageId: req.params.packageId,
    localId: req.params.localId,
  });

  return ok(res, null, 'Card pair deleted');
});
