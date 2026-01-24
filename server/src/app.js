const express = require('express');
const path = require('path');
const cors = require('cors');
const errorHandler = require('./middleware/errorHandler');

const samplesRoutes = require('./routes/samples');
const repeatersRoutes = require('./routes/repeaters');
const coverageRoutes = require('./routes/coverage');
const nodesRoutes = require('./routes/nodes');
const adminRoutes = require('./routes/admin');
const configRoutes = require('./routes/config');
const pathsRoutes = require('./routes/paths');

const app = express();

// Middleware
// CORS configuration - allow all origins for static files and API
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint (before static files to ensure it's always accessible)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Handle OPTIONS requests for CORS preflight (before static files)
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(200);
});

// API routes (before static files to handle API requests first)
app.use('/', samplesRoutes);
app.use('/', repeatersRoutes);
app.use('/', coverageRoutes);
app.use('/', nodesRoutes);
app.use('/', adminRoutes);
app.use('/', configRoutes);
app.use('/', pathsRoutes);

// Handle browser requests for icons on API routes (e.g., /get-nodes.svg)
// These are common browser behaviors and should return 404 silently
app.get(/\.(svg|ico)$/, (req, res) => {
  res.status(404).end();
});

// Serve static files from public directory
// Note: CORS is already handled globally, but we ensure proper MIME types for ES modules
app.use(express.static(path.join(__dirname, '../public'), {
  dotfiles: 'ignore',
  etag: true,
  extensions: ['html', 'js', 'css', 'json', 'png', 'jpg', 'jpeg', 'gif', 'ico', 'svg'],
  index: 'index.html',
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    // Set proper MIME type for ES modules (required for dynamic imports)
    if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
  },
  // Don't fallthrough - let 404s be 404s
  fallthrough: false
}));

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = app;

