function errorHandler(err, req, res, next) {
  // Suppress errors for missing static files (browsers often request icons for API routes)
  if (err.code === 'ENOENT' && err.path && (err.path.endsWith('.svg') || err.path.endsWith('.ico'))) {
    return res.status(404).end();
  }
  
  console.error('Error:', err);
  
  // Validation errors
  if (err.message && err.message.includes('Invalid location')) {
    return res.status(400).json({ error: err.message });
  }
  
  if (err.message && err.message.includes('exceeds max distance')) {
    return res.status(400).json({ error: err.message });
  }
  
  // Database errors
  if (err.code && err.code.startsWith('23')) {
    return res.status(400).json({ error: 'Database constraint violation' });
  }
  
  // Default error
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
}

module.exports = errorHandler;

