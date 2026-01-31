-- Add columns to store latitude and longitude from adverts
-- These coordinates come from the advert payload when ADV_LATLON_MASK is set

ALTER TABLE packet_paths 
  ADD COLUMN IF NOT EXISTS advert_lat DECIMAL(11,8),
  ADD COLUMN IF NOT EXISTS advert_lon DECIMAL(11,8);

-- Index for efficient location-based queries
CREATE INDEX IF NOT EXISTS idx_packet_paths_advert_lat_lon ON packet_paths (advert_lat, advert_lon) 
  WHERE advert_lat IS NOT NULL AND advert_lon IS NOT NULL;
