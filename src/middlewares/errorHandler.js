export function notFound(req, res, next) {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.name === 'ZodError') {
    return res.status(400).json({ success: false, message: 'Validation error', errors: err.errors });
  }

  if (err.code === 11000) {
    return res.status(409).json({ success: false, message: 'Data already exists' });
  }

  const status = err.statusCode || 500;
  return res.status(status).json({ success: false, message: err.message || 'Server error' });
}
