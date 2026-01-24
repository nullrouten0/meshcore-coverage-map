-- Add packet_paths table for storing complete packet path data
-- Enables source/destination/path analysis

CREATE TABLE IF NOT EXISTS packet_paths (
    id SERIAL PRIMARY KEY,
    packet_hash VARCHAR(64) NOT NULL,
    packet_type INTEGER NOT NULL,
    route_type INTEGER NOT NULL,
    observer_id VARCHAR(2) NOT NULL,
    observer_name VARCHAR(255),
    source_node VARCHAR(2),  -- First node in path
    dest_node VARCHAR(2),    -- Last node in path (observer)
    path TEXT[] NOT NULL,     -- Complete path array [node1, node2, ...]
    path_length INTEGER NOT NULL,
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(packet_hash, observer_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_packet_paths_source ON packet_paths (source_node);
CREATE INDEX IF NOT EXISTS idx_packet_paths_dest ON packet_paths (dest_node);
CREATE INDEX IF NOT EXISTS idx_packet_paths_observer ON packet_paths (observer_id);
CREATE INDEX IF NOT EXISTS idx_packet_paths_timestamp ON packet_paths (timestamp);
CREATE INDEX IF NOT EXISTS idx_packet_paths_packet_type ON packet_paths (packet_type);
CREATE INDEX IF NOT EXISTS idx_packet_paths_source_dest ON packet_paths (source_node, dest_node);
