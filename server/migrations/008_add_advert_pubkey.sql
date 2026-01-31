-- Add columns to store full public key, 2-char ID, and name for adverts
-- This allows disambiguating nodes with the same 2-char prefix and displaying names

ALTER TABLE packet_paths 
  ADD COLUMN IF NOT EXISTS advert_pubkey VARCHAR(64),
  ADD COLUMN IF NOT EXISTS advert_id VARCHAR(2),
  ADD COLUMN IF NOT EXISTS advert_name VARCHAR(255);

-- Index for efficient lookups by full pubkey
CREATE INDEX IF NOT EXISTS idx_packet_paths_advert_pubkey ON packet_paths (advert_pubkey) 
  WHERE advert_pubkey IS NOT NULL;

-- Index for efficient lookups by 2-char ID
CREATE INDEX IF NOT EXISTS idx_packet_paths_advert_id ON packet_paths (advert_id) 
  WHERE advert_id IS NOT NULL;
