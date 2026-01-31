const pool = require('../config/database');

async function insert(packetHash, packetType, routeType, observerId, observerName, sourceNode, destNode, path, timestamp, advertPubkey = null, advertId = null, advertName = null, advertLat = null, advertLon = null) {
  const query = `
    INSERT INTO packet_paths (
      packet_hash, packet_type, route_type, observer_id, observer_name,
      source_node, dest_node, path, path_length, timestamp, advert_pubkey, advert_id, advert_name, advert_lat, advert_lon
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    ON CONFLICT (packet_hash, observer_id) DO NOTHING
  `;
  
  // Ensure path is an array (can be empty)
  const pathArray = Array.isArray(path) ? path : [];
  
  await pool.query(query, [
    packetHash,
    packetType,
    routeType,
    observerId,
    observerName || null,
    sourceNode || null,
    destNode || null,
    pathArray,
    pathArray.length,
    timestamp,
    advertPubkey || null,
    advertId || null,
    advertName || null,
    advertLat !== null && advertLat !== undefined ? advertLat : null,
    advertLon !== null && advertLon !== undefined ? advertLon : null
  ]);
}

async function getBySource(sourceNode, limit = 100) {
  const result = await pool.query(
    `SELECT id, packet_hash, packet_type, route_type, observer_id, observer_name,
            source_node, dest_node, path, path_length, timestamp, created_at
     FROM packet_paths
     WHERE source_node = $1
     ORDER BY timestamp DESC
     LIMIT $2`,
    [sourceNode, limit]
  );
  return result.rows;
}

async function getByDest(destNode, limit = 100) {
  const result = await pool.query(
    `SELECT id, packet_hash, packet_type, route_type, observer_id, observer_name,
            source_node, dest_node, path, path_length, timestamp, created_at
     FROM packet_paths
     WHERE dest_node = $1
     ORDER BY timestamp DESC
     LIMIT $2`,
    [destNode, limit]
  );
  return result.rows;
}

async function getBySourceDest(sourceNode, destNode, limit = 100) {
  const result = await pool.query(
    `SELECT id, packet_hash, packet_type, route_type, observer_id, observer_name,
            source_node, dest_node, path, path_length, timestamp, created_at
     FROM packet_paths
     WHERE source_node = $1 AND dest_node = $2
     ORDER BY timestamp DESC
     LIMIT $3`,
    [sourceNode, destNode, limit]
  );
  return result.rows;
}

async function getByObserver(observerId, limit = 100) {
  const result = await pool.query(
    `SELECT id, packet_hash, packet_type, route_type, observer_id, observer_name,
            source_node, dest_node, path, path_length, timestamp, created_at
     FROM packet_paths
     WHERE observer_id = $1
     ORDER BY timestamp DESC
     LIMIT $2`,
    [observerId, limit]
  );
  return result.rows;
}

async function getPathStats(sourceNode, destNode) {
  let query, params;
  
  if (sourceNode && destNode) {
    query = `
      SELECT 
        COUNT(*) as path_count,
        AVG(path_length) as avg_length,
        MIN(path_length) as min_length,
        MAX(path_length) as max_length,
        COUNT(DISTINCT observer_id) as observer_count
      FROM packet_paths
      WHERE source_node = $1 AND dest_node = $2
    `;
    params = [sourceNode, destNode];
  } else if (sourceNode) {
    query = `
      SELECT 
        COUNT(*) as path_count,
        AVG(path_length) as avg_length,
        MIN(path_length) as min_length,
        MAX(path_length) as max_length,
        COUNT(DISTINCT dest_node) as dest_count,
        COUNT(DISTINCT observer_id) as observer_count
      FROM packet_paths
      WHERE source_node = $1
    `;
    params = [sourceNode];
  } else if (destNode) {
    query = `
      SELECT 
        COUNT(*) as path_count,
        AVG(path_length) as avg_length,
        MIN(path_length) as min_length,
        MAX(path_length) as max_length,
        COUNT(DISTINCT source_node) as source_count,
        COUNT(DISTINCT observer_id) as observer_count
      FROM packet_paths
      WHERE dest_node = $1
    `;
    params = [destNode];
  } else {
    query = `
      SELECT 
        COUNT(*) as path_count,
        AVG(path_length) as avg_length,
        MIN(path_length) as min_length,
        MAX(path_length) as max_length,
        COUNT(DISTINCT source_node) as source_count,
        COUNT(DISTINCT dest_node) as dest_count,
        COUNT(DISTINCT observer_id) as observer_count
      FROM packet_paths
    `;
    params = [];
  }
  
  const result = await pool.query(query, params);
  return result.rows[0] || null;
}

async function getTopOriginNodes(limit = 20, filterNode = null, timeRange = null, packetType = null) {
  let query, params = [];
  let paramIndex = 1;
  
  // Build WHERE conditions - filter for adverts only (packet_type = 4) with public keys
  const baseConditions = ['packet_type = 4', 'advert_pubkey IS NOT NULL', 'source_node IS NOT NULL', 'source_node != observer_id'];
  const timeConditions = [];
  
  if (timeRange && timeRange !== 'all') {
    const now = Date.now();
    let cutoffTime;
    switch (timeRange) {
      case 'hour': cutoffTime = now - (60 * 60 * 1000); break;
      case 'day': cutoffTime = now - (24 * 60 * 60 * 1000); break;
      case 'week': cutoffTime = now - (7 * 24 * 60 * 60 * 1000); break;
      case 'month': cutoffTime = now - (30 * 24 * 60 * 60 * 1000); break;
      default: cutoffTime = null;
    }
    if (cutoffTime) {
      timeConditions.push('timestamp >= $' + paramIndex);
      params.push(cutoffTime);
      paramIndex++;
    }
  }
  
  // Note: packetType filter is ignored - we only analyze adverts (type 4)
  
  const allConditions = [...baseConditions, ...timeConditions];
  const whereClause = allConditions.join(' AND ');
  
  if (filterNode) {
    // Filter paths that contain the specified node (excluding observer)
    const filterParamIndex = paramIndex;
    const limitParamIndex = paramIndex + 1;
    query = 
      'WITH filtered_packets AS (' +
      '  SELECT DISTINCT ' +
      '    packet_hash,' +
      '    advert_pubkey,' +
      '    array_remove(path, observer_id) as filtered_path' +
      '  FROM packet_paths' +
      '  WHERE ' + whereClause +
      '), ' +
      'paths_without_observer AS (' +
      '  SELECT ' +
      '    packet_hash,' +
      '    advert_pubkey' +
      '  FROM filtered_packets' +
      '  WHERE $' + filterParamIndex + ' = ANY(filtered_path)' +
      '), ' +
      'node_counts AS (' +
      '  SELECT ' +
      '    pwo.advert_pubkey as source_node,' +
      '    COUNT(DISTINCT pwo.packet_hash) as path_count' +
      '  FROM paths_without_observer pwo' +
      '  WHERE pwo.advert_pubkey IS NOT NULL' +
      '  GROUP BY pwo.advert_pubkey' +
      '), ' +
      'node_details AS (' +
      '  SELECT DISTINCT ON (nc.source_node) ' +
      '    nc.source_node,' +
      '    nc.path_count,' +
      '    pp.advert_id,' +
      '    pp.advert_name as name,' +
      '    pp.advert_lat,' +
      '    pp.advert_lon' +
      '  FROM node_counts nc' +
      '  INNER JOIN packet_paths pp ON pp.advert_pubkey = nc.source_node' +
      '    AND pp.advert_id IS NOT NULL' +
      '  ORDER BY nc.source_node, pp.timestamp DESC' +
      ') ' +
      'SELECT ' +
      '  nd.source_node,' +
      '  nd.path_count,' +
      '  nd.advert_id,' +
      '  nd.name,' +
      '  nd.advert_lat as lat,' +
      '  nd.advert_lon as lon ' +
      'FROM node_details nd ' +
      'ORDER BY nd.path_count DESC ' +
      'LIMIT $' + limitParamIndex;
    params.push(filterNode.toLowerCase(), limit);
  } else {
    // Use advert_pubkey to identify source nodes (the sender of the advert)
    query = 
      'WITH filtered_packets AS (' +
      '  SELECT ' +
      '    packet_hash,' +
      '    advert_pubkey' +
      '  FROM packet_paths' +
      '  WHERE ' + whereClause +
      '), ' +
      'node_counts AS (' +
      '  SELECT ' +
      '    fp.advert_pubkey as source_node,' +
      '    COUNT(DISTINCT fp.packet_hash) as path_count' +
      '  FROM filtered_packets fp' +
      '  WHERE fp.advert_pubkey IS NOT NULL' +
      '  GROUP BY fp.advert_pubkey' +
      '), ' +
      'node_details AS (' +
      '  SELECT DISTINCT ON (nc.source_node) ' +
      '    nc.source_node,' +
      '    nc.path_count,' +
      '    pp.advert_id,' +
      '    pp.advert_name as name,' +
      '    pp.advert_lat,' +
      '    pp.advert_lon' +
      '  FROM node_counts nc' +
      '  INNER JOIN packet_paths pp ON pp.advert_pubkey = nc.source_node' +
      '    AND pp.advert_id IS NOT NULL' +
      '  ORDER BY nc.source_node, pp.timestamp DESC' +
      ') ' +
      'SELECT ' +
      '  nd.source_node,' +
      '  nd.path_count,' +
      '  nd.advert_id,' +
      '  nd.name,' +
      '  nd.advert_lat as lat,' +
      '  nd.advert_lon as lon ' +
      'FROM node_details nd ' +
      'ORDER BY nd.path_count DESC ' +
      'LIMIT $' + paramIndex;
    params.push(limit);
  }
  
  // Debug logging
  if (process.env.DEBUG_QUERIES === 'true') {
    console.log('getTopOriginNodes SQL:', query.replace(/\s+/g, ' '));
    console.log('getTopOriginNodes params:', JSON.stringify(params));
  }
  
  const result = await pool.query(query, params);
  return result.rows;
}

async function getTopDestinationNodes(limit = 20, filterNode = null, timeRange = null, packetType = null) {
  let query, params = [];
  let paramIndex = 1;
  
  // Build WHERE conditions - filter for adverts only (packet_type = 4) with public keys
  const conditions = ['packet_type = 4', 'advert_pubkey IS NOT NULL', 'array_length(path, 1) > 0'];
  
  if (timeRange && timeRange !== 'all') {
    const now = Date.now();
    let cutoffTime;
    switch (timeRange) {
      case 'hour': cutoffTime = now - (60 * 60 * 1000); break;
      case 'day': cutoffTime = now - (24 * 60 * 60 * 1000); break;
      case 'week': cutoffTime = now - (7 * 24 * 60 * 60 * 1000); break;
      case 'month': cutoffTime = now - (30 * 24 * 60 * 60 * 1000); break;
      default: cutoffTime = null;
    }
    if (cutoffTime) {
      conditions.push(`timestamp >= $${paramIndex}`);
      params.push(cutoffTime);
      paramIndex++;
    }
  }
  
  // Note: packetType filter is ignored - we only analyze adverts (type 4)
  
  const whereClause = conditions.join(' AND ');
  
  if (filterNode) {
    // Filter paths that contain the specified node (excluding observer)
    // For dest nodes, we need to find their pubkey by looking up rows where they appear as source
    const filterParamIndex = paramIndex;
    const limitParamIndex = paramIndex + 1;
    query = 
      'WITH filtered_packets AS (' +
      '  SELECT DISTINCT ' +
      '    packet_hash,' +
      '    dest_node' +
      '  FROM packet_paths' +
      '  WHERE ' + whereClause +
      '    AND dest_node IS NOT NULL' +
      '    AND $' + filterParamIndex + ' = ANY(path)' +
      '), ' +
      'node_counts AS (' +
      '  SELECT ' +
      '    dest_node,' +
      '    COUNT(DISTINCT packet_hash) as path_count' +
      '  FROM filtered_packets' +
      '  GROUP BY dest_node' +
      '), ' +
      'dest_pubkeys AS (' +
      '  SELECT DISTINCT ON (nc.dest_node) ' +
      '    nc.dest_node,' +
      '    nc.path_count,' +
      '    pp.advert_pubkey as dest_pubkey,' +
      '    pp.advert_id,' +
      '    pp.advert_name,' +
      '    pp.advert_lat,' +
      '    pp.advert_lon' +
      '  FROM node_counts nc' +
      '  INNER JOIN packet_paths pp ON LOWER(SUBSTRING(pp.advert_pubkey, 1, 2)) = LOWER(nc.dest_node)' +
      '    AND pp.advert_pubkey IS NOT NULL' +
      '    AND pp.packet_type = 4' +
      '  ORDER BY nc.dest_node, pp.timestamp DESC' +
      ') ' +
      'SELECT ' +
      '  dp.dest_pubkey as dest_node,' +
      '  dp.path_count,' +
      '  dp.advert_id,' +
      '  dp.advert_name as name,' +
      '  dp.advert_lat as lat,' +
      '  dp.advert_lon as lon ' +
      'FROM dest_pubkeys dp ' +
      'WHERE dp.dest_pubkey IS NOT NULL ' +
      'ORDER BY dp.path_count DESC ' +
      'LIMIT $' + limitParamIndex;
    params.push(filterNode.toLowerCase(), limit);
  } else {
    query = 
      'WITH filtered_packets AS (' +
      '  SELECT ' +
      '    packet_hash,' +
      '    dest_node' +
      '  FROM packet_paths' +
      '  WHERE ' + whereClause +
      '    AND dest_node IS NOT NULL' +
      '), ' +
      'node_counts AS (' +
      '  SELECT ' +
      '    dest_node,' +
      '    COUNT(DISTINCT packet_hash) as path_count' +
      '  FROM filtered_packets' +
      '  GROUP BY dest_node' +
      '), ' +
      'dest_pubkeys AS (' +
      '  SELECT DISTINCT ON (nc.dest_node) ' +
      '    nc.dest_node,' +
      '    nc.path_count,' +
      '    pp.advert_pubkey as dest_pubkey,' +
      '    pp.advert_id,' +
      '    pp.advert_name,' +
      '    pp.advert_lat,' +
      '    pp.advert_lon' +
      '  FROM node_counts nc' +
      '  INNER JOIN packet_paths pp ON LOWER(SUBSTRING(pp.advert_pubkey, 1, 2)) = LOWER(nc.dest_node)' +
      '    AND pp.advert_pubkey IS NOT NULL' +
      '    AND pp.packet_type = 4' +
      '  ORDER BY nc.dest_node, pp.timestamp DESC' +
      ') ' +
      'SELECT ' +
      '  dp.dest_pubkey as dest_node,' +
      '  dp.path_count,' +
      '  dp.advert_id,' +
      '  dp.advert_name as name,' +
      '  dp.advert_lat as lat,' +
      '  dp.advert_lon as lon ' +
      'FROM dest_pubkeys dp ' +
      'WHERE dp.dest_pubkey IS NOT NULL ' +
      'ORDER BY dp.path_count DESC ' +
      'LIMIT $' + paramIndex;
    params.push(limit);
  }
  
  const result = await pool.query(query, params);
  return result.rows;
}

async function getTopPathMembers(limit = 20, filterNode = null, timeRange = null, packetType = null) {
  let query, params = [];
  let paramIndex = 1;
  
  // Build WHERE conditions - filter for adverts only (packet_type = 4) with public keys
  const conditions = ['packet_type = 4', 'advert_pubkey IS NOT NULL', 'array_length(path, 1) > 0'];
  
  if (timeRange && timeRange !== 'all') {
    const now = Date.now();
    let cutoffTime;
    switch (timeRange) {
      case 'hour': cutoffTime = now - (60 * 60 * 1000); break;
      case 'day': cutoffTime = now - (24 * 60 * 60 * 1000); break;
      case 'week': cutoffTime = now - (7 * 24 * 60 * 60 * 1000); break;
      case 'month': cutoffTime = now - (30 * 24 * 60 * 60 * 1000); break;
      default: cutoffTime = null;
    }
    if (cutoffTime) {
      conditions.push(`timestamp >= $${paramIndex}`);
      params.push(cutoffTime);
      paramIndex++;
    }
  }
  
  // Note: packetType filter is ignored - we only analyze adverts (type 4)
  
  const whereClause = conditions.join(' AND ');
  
  if (filterNode) {
    // Only show nodes that appear in paths containing the filter node (excluding observer, source, and dest)
    const filterParamIndex = paramIndex;
    const limitParamIndex = paramIndex + 1;
    query = 
      'WITH filtered_packets AS (' +
      '  SELECT DISTINCT ' +
      '    packet_hash,' +
      '    source_node,' +
      '    dest_node,' +
      '    path[1:array_length(path, 1) - 1] as filtered_path' +
      '  FROM packet_paths' +
      '  WHERE ' + whereClause +
      '    AND array_length(path, 1) > 1' +
      '    AND $' + filterParamIndex + ' = ANY(path[1:array_length(path, 1) - 1])' +
      '), ' +
      'paths_excluding_endpoints AS (' +
      '  SELECT ' +
      '    packet_hash as path_id,' +
      '    array_remove(array_remove(filtered_path, source_node), dest_node) as middle_path' +
      '  FROM filtered_packets' +
      '  WHERE array_length(array_remove(array_remove(filtered_path, source_node), dest_node), 1) > 0' +
      '), ' +
      'node_counts AS (' +
      '  SELECT ' +
      '    node_id,' +
      '    COUNT(DISTINCT path_id) as path_count' +
      '  FROM paths_excluding_endpoints,' +
      '  LATERAL unnest(middle_path) AS node_id' +
      '  WHERE node_id != $' + filterParamIndex +
      '  GROUP BY node_id' +
      '), ' +
      'path_nodes AS (' +
      '  SELECT ' +
      '    fp.path_id,' +
      '    node_id,' +
      '    pos' +
      '  FROM paths_excluding_endpoints fp,' +
      '  LATERAL unnest(fp.middle_path) WITH ORDINALITY AS nodes(node_id, pos)' +
      '), ' +
      'neighbors AS (' +
      '  SELECT ' +
      '    pn1.node_id,' +
      '    COUNT(DISTINCT pn2.node_id) as neighbor_count' +
      '  FROM path_nodes pn1' +
      '  JOIN path_nodes pn2 ON pn1.path_id = pn2.path_id' +
      '  WHERE pn1.node_id != $' + filterParamIndex +
      '  AND pn2.node_id != pn1.node_id' +
      '  AND ABS(pn1.pos - pn2.pos) = 1' +
      '  GROUP BY pn1.node_id' +
      '), ' +
      'node_pubkeys AS (' +
      '  SELECT DISTINCT ON (nc.node_id) ' +
      '    nc.node_id,' +
      '    nc.path_count,' +
      '    pp.advert_pubkey as node_pubkey,' +
      '    pp.advert_id,' +
      '    pp.advert_name,' +
      '    pp.advert_lat,' +
      '    pp.advert_lon' +
      '  FROM node_counts nc' +
      '  INNER JOIN packet_paths pp ON LOWER(SUBSTRING(pp.advert_pubkey, 1, 2)) = LOWER(nc.node_id)' +
      '    AND pp.advert_pubkey IS NOT NULL' +
      '    AND pp.packet_type = 4' +
      '  ORDER BY nc.node_id, pp.timestamp DESC' +
      ') ' +
      'SELECT ' +
      '  np.node_pubkey as node_id,' +
      '  np.path_count,' +
      '  COALESCE(n.neighbor_count, 0) as neighbor_count,' +
      '  np.advert_id,' +
      '  np.advert_name as name,' +
      '  np.advert_lat as lat,' +
      '  np.advert_lon as lon ' +
      'FROM node_pubkeys np ' +
      'LEFT JOIN neighbors n ON LOWER(SUBSTRING(np.node_pubkey, 1, 2)) = n.node_id ' +
      'WHERE np.node_pubkey IS NOT NULL ' +
      'ORDER BY np.path_count DESC, COALESCE(n.neighbor_count, 0) DESC ' +
      'LIMIT $' + limitParamIndex;
    params.push(filterNode.toLowerCase(), limit);
  } else {
    query = 
      'WITH filtered_packets AS (' +
      '  SELECT DISTINCT ' +
      '    packet_hash,' +
      '    source_node,' +
      '    dest_node,' +
      '    path[1:array_length(path, 1) - 1] as filtered_path' +
      '  FROM packet_paths' +
      '  WHERE ' + whereClause +
      '    AND array_length(path, 1) > 1' +
      '), ' +
      'paths_excluding_endpoints AS (' +
      '  SELECT ' +
      '    packet_hash as path_id,' +
      '    array_remove(array_remove(filtered_path, source_node), dest_node) as middle_path' +
      '  FROM filtered_packets' +
      '  WHERE array_length(array_remove(array_remove(filtered_path, source_node), dest_node), 1) > 0' +
      '), ' +
      'node_counts AS (' +
      '  SELECT ' +
      '    node_id,' +
      '    COUNT(DISTINCT path_id) as path_count' +
      '  FROM paths_excluding_endpoints,' +
      '  LATERAL unnest(middle_path) AS node_id' +
      '  GROUP BY node_id' +
      '), ' +
      'path_nodes AS (' +
      '  SELECT ' +
      '    pwo.path_id,' +
      '    node_id,' +
      '    pos' +
      '  FROM paths_excluding_endpoints pwo,' +
      '  LATERAL unnest(pwo.middle_path) WITH ORDINALITY AS nodes(node_id, pos)' +
      '), ' +
      'neighbors AS (' +
      '  SELECT ' +
      '    pn1.node_id,' +
      '    COUNT(DISTINCT pn2.node_id) as neighbor_count' +
      '  FROM path_nodes pn1' +
      '  JOIN path_nodes pn2 ON pn1.path_id = pn2.path_id' +
      '  WHERE pn1.node_id != pn2.node_id' +
      '  AND ABS(pn1.pos - pn2.pos) = 1' +
      '  GROUP BY pn1.node_id' +
      '), ' +
      'node_pubkeys AS (' +
      '  SELECT DISTINCT ON (nc.node_id) ' +
      '    nc.node_id,' +
      '    nc.path_count,' +
      '    pp.advert_pubkey as node_pubkey,' +
      '    pp.advert_id,' +
      '    pp.advert_name,' +
      '    pp.advert_lat,' +
      '    pp.advert_lon' +
      '  FROM node_counts nc' +
      '  INNER JOIN packet_paths pp ON LOWER(SUBSTRING(pp.advert_pubkey, 1, 2)) = LOWER(nc.node_id)' +
      '    AND pp.advert_pubkey IS NOT NULL' +
      '    AND pp.packet_type = 4' +
      '  ORDER BY nc.node_id, pp.timestamp DESC' +
      ') ' +
      'SELECT ' +
      '  np.node_pubkey as node_id,' +
      '  np.path_count,' +
      '  COALESCE(n.neighbor_count, 0) as neighbor_count,' +
      '  np.advert_id,' +
      '  np.advert_name as name,' +
      '  np.advert_lat as lat,' +
      '  np.advert_lon as lon ' +
      'FROM node_pubkeys np ' +
      'LEFT JOIN neighbors n ON LOWER(SUBSTRING(np.node_pubkey, 1, 2)) = n.node_id ' +
      'WHERE np.node_pubkey IS NOT NULL ' +
      'ORDER BY np.path_count DESC, COALESCE(n.neighbor_count, 0) DESC ' +
      'LIMIT $' + paramIndex;
    params.push(limit);
  }
  
  const result = await pool.query(query, params);
  return result.rows;
}

async function getPacketTypeDistribution() {
  const result = await pool.query(`
    SELECT 
      packet_type,
      COUNT(*) as count,
      COUNT(DISTINCT observer_id) as observer_count
    FROM packet_paths
    GROUP BY packet_type
    ORDER BY packet_type
  `);
  return result.rows;
}

async function debugPacketCounts(packetType, timeRange = null) {
  // Build WHERE conditions to match getTopOriginNodes
  const conditions = ['packet_type = $1', 'source_node IS NOT NULL', 'source_node != observer_id'];
  const params = [packetType];
  let paramIndex = 2;
  
  if (timeRange && timeRange !== 'all') {
    const now = Date.now();
    let cutoffTime;
    switch (timeRange) {
      case 'hour': cutoffTime = now - (60 * 60 * 1000); break;
      case 'day': cutoffTime = now - (24 * 60 * 60 * 1000); break;
      case 'week': cutoffTime = now - (7 * 24 * 60 * 60 * 1000); break;
      case 'month': cutoffTime = now - (30 * 24 * 60 * 60 * 1000); break;
      default: cutoffTime = null;
    }
    if (cutoffTime) {
      conditions.push(`timestamp >= $${paramIndex}`);
      params.push(cutoffTime);
      paramIndex++;
    }
  }
  
  const whereClause = conditions.join(' AND ');
  
  const result = await pool.query(`
    WITH all_rows AS (
      SELECT 
        packet_hash,
        source_node,
        observer_id,
        timestamp,
        id
      FROM packet_paths
      WHERE ${whereClause}
      ORDER BY packet_hash, timestamp DESC
    ),
    unique_packets AS (
      SELECT DISTINCT ON (packet_hash)
        packet_hash,
        source_node,
        id
      FROM all_rows
      ORDER BY packet_hash, timestamp DESC
    ),
    source_counts AS (
      SELECT 
        source_node,
        COUNT(*) as count
      FROM unique_packets
      GROUP BY source_node
    )
    SELECT 
      (SELECT COUNT(*) FROM all_rows) as total_rows,
      (SELECT COUNT(DISTINCT packet_hash) FROM all_rows) as unique_packet_hashes,
      (SELECT COUNT(*) FROM unique_packets) as unique_packets_count,
      (SELECT json_agg(source_counts ORDER BY count DESC) FROM source_counts) as source_node_counts,
      (SELECT json_agg(DISTINCT packet_hash ORDER BY packet_hash) FROM all_rows LIMIT 20) as sample_packet_hashes
  `, params);
  
  return result.rows[0];
}

module.exports = {
  insert,
  getBySource,
  getByDest,
  getBySourceDest,
  getByObserver,
  getPathStats,
  getTopOriginNodes,
  getTopDestinationNodes,
  getTopPathMembers,
  getPacketTypeDistribution,
  debugPacketCounts
};
