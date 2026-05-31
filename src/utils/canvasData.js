const MAX_CANVAS_ACTIONS = 800;
const MAX_POINTS_PER_STROKE = 6000;
const MAX_TOTAL_POINTS_PER_SIDE = 50000;
const MAX_CANVAS_DATA_SIZE = 750000;
const MAX_TEXT_LENGTH = 5000;

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

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
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

function sanitizeText(action, index) {
  const text = String(action?.text || '').slice(0, MAX_TEXT_LENGTH);
  if (!text.trim()) return null;

  const now = Date.now();
  const createdAt = Number.isFinite(Number(action.createdAt))
    ? Number(action.createdAt)
    : now;

  return {
    type: 'text',
    id: String(action.id || `text_${createdAt}_${index}`).slice(0, 80),
    text,
    x: roundNumber(action.x),
    y: roundNumber(action.y),
    width: clampNumber(action.width, 20, 4000, 500),
    height: clampNumber(action.height, 20, 4000, 80),
    fontFamily: String(action.fontFamily || 'Arial').slice(0, 80),
    fontSize: clampNumber(action.fontSize, 8, 200, 36),
    fontWeight: oneOf(action.fontWeight, ['normal', 'bold'], 'bold'),
    fontStyle: oneOf(action.fontStyle, ['normal', 'italic'], 'normal'),
    textDecoration: oneOf(action.textDecoration, ['none', 'underline'], 'none'),
    color: String(action.color || '#000000').slice(0, 32),
    backgroundColor: String(action.backgroundColor || 'transparent').slice(0, 32),
    borderColor: String(action.borderColor || 'transparent').slice(0, 32),
    borderWidth: clampNumber(action.borderWidth, 0, 20, 0),
    align: oneOf(action.align, ['left', 'center', 'right'], 'left'),
    lineHeight: clampNumber(action.lineHeight, 0.8, 3, 1.2),
    letterSpacing: clampNumber(action.letterSpacing, -5, 50, 0),
    opacity: clampNumber(action.opacity, 0, 1, 1),
    rotation: clampNumber(action.rotation, -360, 360, 0),
    scaleX: clampNumber(action.scaleX, 0.1, 10, 1),
    scaleY: clampNumber(action.scaleY, 0.1, 10, 1),
    locked: Boolean(action.locked),
    zIndex: Number.isFinite(Number(action.zIndex)) ? Number(action.zIndex) : index,
    createdAt,
    updatedAt: Number.isFinite(Number(action.updatedAt))
      ? Number(action.updatedAt)
      : createdAt,
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

      if (action?.type === 'text') {
        return sanitizeText(action, index);
      }

      return null;
    })
    .filter(Boolean)
    .sort((a, b) => (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0));

  return sanitizedActions.length > 0 ? JSON.stringify(sanitizedActions) : null;
}
