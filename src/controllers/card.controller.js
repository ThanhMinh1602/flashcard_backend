import Package from '../models/Package.js';
import Card from '../models/Card.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/response.js';

async function ensurePackage(userId, packageId) {
  return Package.findOne({
    _id: packageId,
    userId,
    deletedAt: null,
  });
}

async function removeStoredCanvasData(userId, packageId) {
  const cards = await Card.find({
    userId,
    packageId,
    $or: [
      { 'front.canvasData': { $exists: true } },
      { 'back.canvasData': { $exists: true } },
    ],
  }).select('front.canvasData back.canvasData');

  const operations = cards
    .map((card) => {
      const frontCanvasData = sanitizeCanvasData(card.front?.canvasData);
      const backCanvasData = sanitizeCanvasData(card.back?.canvasData);
      const update = { $set: {}, $unset: {} };

      if (frontCanvasData) {
        update.$set['front.canvasData'] = frontCanvasData;
      } else if (card.front?.canvasData) {
        update.$unset['front.canvasData'] = '';
      }

      if (backCanvasData) {
        update.$set['back.canvasData'] = backCanvasData;
      } else if (card.back?.canvasData) {
        update.$unset['back.canvasData'] = '';
      }

      if (Object.keys(update.$set).length === 0) delete update.$set;
      if (Object.keys(update.$unset).length === 0) delete update.$unset;
      if (!update.$set && !update.$unset) return null;

      return {
        updateOne: {
          filter: { _id: card._id },
          update,
        },
      };
    })
    .filter(Boolean);

  if (operations.length > 0) {
    await Card.bulkWrite(operations);
  }
}

function sanitizeCanvasData(canvasData) {
  if (!canvasData) return null;

  let parsed = canvasData;

  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }

  if (!Array.isArray(parsed)) return null;

  const sanitizedActions = parsed
    .map((action) => {
      if (action?.type === 'image' && action.dataUrl) {
        return {
          type: 'image',
          dataUrl: action.dataUrl,
          x: Number(action.x) || 0,
          y: Number(action.y) || 0,
          width: Math.max(1, Number(action.width) || 1),
          height: Math.max(1, Number(action.height) || 1),
        };
      }

      if (action?.type === 'stroke' && Array.isArray(action.points)) {
        return {
          type: 'stroke',
          tool: action.tool || 'brush',
          brushType: action.brushType || 'pen',
          color: action.color || '#0f172a',
          size: Number(action.size) || 4,
          opacity: Number(action.opacity) || 1,
          points: action.points.map((point) => [
            Number(point[0]) || 0,
            Number(point[1]) || 0,
            Number(point[2]) || 1,
          ]),
        };
      }

      return null;
    })
    .filter(Boolean);

  return sanitizedActions.length > 0 ? JSON.stringify(sanitizedActions) : null;
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

  payload.canvasData = sanitizeCanvasData(body.canvasData);

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

// PUT /api/packages/:packageId/cards/bulk
//
// Lưu nhiều cặp thẻ trong 1 request.
// Dùng cho nút "Lưu tất cả" để chỉ lưu những card đã thay đổi.
export const bulkSaveCards = asyncHandler(async (req, res) => {
  const pkg = await ensurePackage(req.user._id, req.params.packageId);

  if (!pkg) {
    return res.status(404).json({
      success: false,
      message: 'Package not found',
    });
  }

  const { cards = [] } = req.body;

  if (!Array.isArray(cards)) {
    return res.status(400).json({
      success: false,
      message: 'cards must be an array',
    });
  }

  if (cards.length === 0) {
    return ok(
      res,
      {
        savedCount: 0,
        cards: [],
      },
      'No cards to save',
    );
  }

  const operations = cards
    .filter((card) => card?.localId)
    .map((card) => {
      const localId = String(card.localId);
      const frontPayload = cleanPayload(card.front || {});
      const backPayload = cleanPayload(card.back || {});

      return {
        updateOne: {
          filter: {
            userId: req.user._id,
            packageId: req.params.packageId,
            localId,
          },
          update: {
            $set: {
              userId: req.user._id,
              packageId: req.params.packageId,
              localId,
              sideDocId: `${localId}_pair`,
              front: frontPayload,
              back: backPayload,
            },
          },
          upsert: true,
        },
      };
    });

  if (operations.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No valid cards to save',
    });
  }

  await Card.bulkWrite(operations);

  const localIds = cards
    .map((card) => (card?.localId ? String(card.localId) : null))
    .filter(Boolean);

  const savedCards = await Card.find({
    userId: req.user._id,
    packageId: req.params.packageId,
    localId: {
      $in: localIds,
    },
  }).sort({ updatedAt: 1 });

  return ok(
    res,
    {
      savedCount: savedCards.length,
      cards: savedCards.map((card) => card.toPairClient()),
    },
    'Cards saved',
  );
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

  await removeStoredCanvasData(req.user._id, req.params.packageId);

  const filter = {
    userId: req.user._id,
    packageId: req.params.packageId,
  };

  const hasPaginationQuery =
    req.query.limit !== undefined || req.query.offset !== undefined;

  const query = Card.find(filter).sort({
    updatedAt: 1,
  });

  let pagination = null;

  if (hasPaginationQuery) {
    const limit = Math.min(
      10,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 10),
    );
    const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);

    query.skip(offset).limit(limit);

    const total = await Card.countDocuments(filter);
    pagination = {
      limit,
      offset,
      total,
      hasMore: offset + limit < total,
      nextOffset: Math.min(offset + limit, total),
    };
  }

  const cards = await query;

  const result = cards.flatMap((card) => {
    return [card.toSideClient('front'), card.toSideClient('back')];
  });

  if (pagination) {
    return ok(res, {
      items: result,
      pagination,
    });
  }

  return ok(res, result);
});

export const getFlashcardSummaries = asyncHandler(async (req, res) => {
  const pkg = await ensurePackage(req.user._id, req.params.packageId);

  if (!pkg) {
    return res.status(404).json({
      success: false,
      message: 'Package not found',
    });
  }

  await removeStoredCanvasData(req.user._id, req.params.packageId);

  const filter = {
    userId: req.user._id,
    packageId: req.params.packageId,
  };

  const limit = Math.min(
    10,
    Math.max(1, Number.parseInt(req.query.limit, 10) || 10),
  );
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);

  const [cards, total] = await Promise.all([
    Card.find(filter)
      .select('localId front.backgroundPairId back.backgroundPairId createdAt updatedAt')
      .sort({ updatedAt: 1 })
      .skip(offset)
      .limit(limit),
    Card.countDocuments(filter),
  ]);

  return ok(res, {
    items: cards.map((card) => ({
      id: card.localId,
      localId: card.localId,
      backgroundPairId:
        card.front?.backgroundPairId || card.back?.backgroundPairId || '1',
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    })),
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + limit < total,
      nextOffset: Math.min(offset + limit, total),
    },
  });
});

export const getFlashcardPair = asyncHandler(async (req, res) => {
  const pkg = await ensurePackage(req.user._id, req.params.packageId);

  if (!pkg) {
    return res.status(404).json({
      success: false,
      message: 'Package not found',
    });
  }

  await removeStoredCanvasData(req.user._id, req.params.packageId);

  const card = await Card.findOne({
    userId: req.user._id,
    packageId: req.params.packageId,
    localId: req.params.localId,
  });

  if (!card) {
    return res.status(404).json({
      success: false,
      message: 'Card pair not found',
    });
  }

  return ok(res, card.toPairClient());
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

  await removeStoredCanvasData(req.user._id, req.params.packageId);

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
