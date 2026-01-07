const express = require('express');
const router = express.Router();
const { getCenterPos, getMaxDistanceMiles, getInitialZoom } = require('../utils/shared');

// GET /config - Get frontend configuration
router.get('/config', (req, res) => {
  const centerPos = getCenterPos();
  const maxDistanceMiles = getMaxDistanceMiles();
  const initialZoom = getInitialZoom();
  
  res.json({
    centerPos: centerPos,
    maxDistanceMiles: maxDistanceMiles,
    initialZoom: initialZoom
  });
});

module.exports = router;

