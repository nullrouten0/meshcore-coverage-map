const express = require('express');
const router = express.Router();
const packetPathsModel = require('../models/packet_paths');

// POST /put-path - Accept path data from MQTT scraper
router.post('/put-path', express.json(), async (req, res, next) => {
  try {
    const {
      packet_hash,
      packet_type,
      route_type,
      observer_id,
      observer_name,
      source_node,
      dest_node,
      path,
      timestamp
    } = req.body;

    // Validate required fields
    if (!packet_hash || packet_type === undefined || route_type === undefined || 
        !observer_id || !path || !Array.isArray(path) || timestamp === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Normalize node IDs to lowercase
    const normalizedObserverId = observer_id.toLowerCase();
    const normalizedSourceNode = source_node ? source_node.toLowerCase() : null;
    const normalizedDestNode = dest_node ? dest_node.toLowerCase() : null;
    const normalizedPath = path.map(node => node.toLowerCase());

    // Use provided timestamp or current time
    const pathTimestamp = timestamp || Date.now();

    await packetPathsModel.insert(
      packet_hash,
      parseInt(packet_type),
      parseInt(route_type),
      normalizedObserverId,
      observer_name || null,
      normalizedSourceNode,
      normalizedDestNode,
      normalizedPath,
      pathTimestamp
    );

    res.send('OK');
  } catch (error) {
    next(error);
  }
});

// GET /get-paths - Query paths with optional filters
router.get('/get-paths', async (req, res, next) => {
  try {
    const { source, dest, observer, limit } = req.query;
    const queryLimit = limit ? parseInt(limit) : 100;

    let paths;
    if (source && dest) {
      paths = await packetPathsModel.getBySourceDest(source.toLowerCase(), dest.toLowerCase(), queryLimit);
    } else if (source) {
      paths = await packetPathsModel.getBySource(source.toLowerCase(), queryLimit);
    } else if (dest) {
      paths = await packetPathsModel.getByDest(dest.toLowerCase(), queryLimit);
    } else if (observer) {
      paths = await packetPathsModel.getByObserver(observer.toLowerCase(), queryLimit);
    } else {
      // If no filters, return empty (or could add getAll function)
      paths = [];
    }

    res.json({ paths });
  } catch (error) {
    next(error);
  }
});

// GET /get-path-stats - Get path statistics
router.get('/get-path-stats', async (req, res, next) => {
  try {
    const { source, dest } = req.query;
    
    const sourceNode = source ? source.toLowerCase() : null;
    const destNode = dest ? dest.toLowerCase() : null;

    const stats = await packetPathsModel.getPathStats(sourceNode, destNode);
    
    if (!stats) {
      return res.json({
        path_count: 0,
        avg_length: 0,
        min_length: 0,
        max_length: 0
      });
    }

    res.json({
      path_count: parseInt(stats.path_count) || 0,
      avg_length: stats.avg_length ? parseFloat(stats.avg_length) : 0,
      min_length: parseInt(stats.min_length) || 0,
      max_length: parseInt(stats.max_length) || 0,
      source_count: stats.source_count ? parseInt(stats.source_count) : undefined,
      dest_count: stats.dest_count ? parseInt(stats.dest_count) : undefined,
      observer_count: parseInt(stats.observer_count) || 0
    });
  } catch (error) {
    next(error);
  }
});

// GET /get-top-origins - Get most frequent origin nodes
router.get('/get-top-origins', async (req, res, next) => {
  try {
    const { limit, filter, timeRange, packetType } = req.query;
    const queryLimit = limit ? parseInt(limit) : 20;
    const filterNode = filter ? filter.toLowerCase() : null;
    const timeRangeFilter = timeRange || null;
    const packetTypeFilter = packetType || null;
    
    const origins = await packetPathsModel.getTopOriginNodes(queryLimit, filterNode, timeRangeFilter, packetTypeFilter);
    res.json({ origins });
  } catch (error) {
    next(error);
  }
});

// GET /get-top-destinations - Get most frequent destination nodes
router.get('/get-top-destinations', async (req, res, next) => {
  try {
    const { limit, filter, timeRange, packetType } = req.query;
    const queryLimit = limit ? parseInt(limit) : 20;
    const filterNode = filter ? filter.toLowerCase() : null;
    const timeRangeFilter = timeRange || null;
    const packetTypeFilter = packetType || null;
    
    const destinations = await packetPathsModel.getTopDestinationNodes(queryLimit, filterNode, timeRangeFilter, packetTypeFilter);
    res.json({ destinations });
  } catch (error) {
    next(error);
  }
});

// GET /get-top-path-members - Get most frequent path members
router.get('/get-top-path-members', async (req, res, next) => {
  try {
    const { limit, filter, timeRange, packetType } = req.query;
    const queryLimit = limit ? parseInt(limit) : 20;
    const filterNode = filter ? filter.toLowerCase() : null;
    const timeRangeFilter = timeRange || null;
    const packetTypeFilter = packetType || null;
    
    const members = await packetPathsModel.getTopPathMembers(queryLimit, filterNode, timeRangeFilter, packetTypeFilter);
    res.json({ members });
  } catch (error) {
    next(error);
  }
});

// GET /get-packet-types - Get distribution of packet types
router.get('/get-packet-types', async (req, res, next) => {
  try {
    const result = await packetPathsModel.getPacketTypeDistribution();
    res.json({ distribution: result });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
