const MAX_CANVAS_ACTIONS = 800;
const MAX_POINTS_PER_STROKE = 6000;
const MAX_TOTAL_POINTS_PER_SIDE = 50000;
const MAX_CANVAS_DATA_SIZE = 750000;

const DATA_IMAGE_PATTERN = /^data:image\/[a-zA-Z0-9.+-]+;base64,/;

export function isImageDataUrl(value) {
  return typeof value === 'string' && DATA_IMAGE_PATTERN.test(value);
}

function parseCanvasData(canvasData) {
  if (!canvasData) return [];
  if (Array.isArray(canvasData)) return canvasData;

  if (typeof canvasData !== 'string') return [];
  if (canvasData.length > MAX_CANVAS_DATA_SIZE) return [];

  try {
    const parsed = JSON.parse(canvasData);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function roundNumber(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(number * 10) / 10;
}

function sanitizePoint(point) {
  if (!Array.isArray(point) || point.length < 2) return null;

  const x = Number(point[0]);
  const y = Number(point[1]);

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  if (point[2] === undefined) {
    return [roundNumber(x), roundNumber(y)];
  }

  const pressure = Math.min(Math.max(Number(point[2]) || 0.5, 0), 1);
  return [roundNumber(x), roundNumber(y), Math.round(pressure * 100) / 100];
}

function sanitizeStroke(action, index, totalPointBudget) {
  const rawPoints = Array.isArray(action.points) ? action.points : [];
  const points = [];

  for (const point of rawPoints) {
    if (points.length >= MAX_POINTS_PER_STROKE || totalPointBudget.count >= MAX_TOTAL_POINTS_PER_SIDE) {
      break;
    }

    const sanitizedPoint = sanitizePoint(point);
    if (!sanitizedPoint) continue;

    points.push(sanitizedPoint);
    totalPointBudget.count += 1;
  }

  if (points.length < 2) return null;

  const now = Date.now();
  const createdAt = Number.isFinite(Number(action.createdAt))
    ? Number(action.createdAt)
    : now;

  return {
    type: 'stroke',
    id: String(action.id || `stroke_${createdAt}_${index}`).slice(0, 80),
    tool: String(action.tool === 'brush'
      ? action.brushType || 'pen'
      : action.tool || action.brushType || 'pen').slice(0, 24),
    brushType: String(action.brushType || action.tool || 'pen').slice(0, 24),
    points,
    color: String(action.color || '#0f172a').slice(0, 32),
    size: Math.min(Math.max(Number(action.size) || 4, 1), 200),
    opacity: Math.min(Math.max(Number(action.opacity) || 1, 0), 1),
    zIndex: Number.isFinite(Number(action.zIndex)) ? Number(action.zIndex) : index,
    createdAt,
    updatedAt: Number.isFinite(Number(action.updatedAt))
      ? Number(action.updatedAt)
      : createdAt,
  };
}

function sanitizeLegacyImage(action, index) {
  if (!isImageDataUrl(action?.dataUrl)) return null;
  if (action.source === 'session') return null;

  // Legacy compatibility only: old cards may contain image.dataUrl layers.
  // New drawing saves should use stroke/text-like editable objects, not base64.
  return {
    type: 'image',
    source: 'legacy',
    dataUrl: action.dataUrl,
    x: roundNumber(action.x),
    y: roundNumber(action.y),
    width: Math.max(1, roundNumber(action.width, 1)),
    height: Math.max(1, roundNumber(action.height, 1)),
    zIndex: Number.isFinite(Number(action.zIndex)) ? Number(action.zIndex) : index,
  };
}

export function sanitizeCanvasData(canvasData) {
  const parsed = parseCanvasData(canvasData).slice(0, MAX_CANVAS_ACTIONS);
  const totalPointBudget = { count: 0 };

  const sanitizedActions = parsed
    .map((action, index) => {
      if (action?.type === 'stroke') {
        return sanitizeStroke(action, index, totalPointBudget);
      }

      if (action?.type === 'image') {
        return sanitizeLegacyImage(action, index);
      }

      return null;
    })
    .filter(Boolean)
    .sort((a, b) => (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0));

  return sanitizedActions.length > 0 ? JSON.stringify(sanitizedActions) : null;
}
