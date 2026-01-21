-- Fix snr and rssi column types to support decimal values
-- RSSI values are in dBm and can be negative decimals (e.g., -1.25, -85.5)
-- SNR values can also be decimals

-- Update samples table
ALTER TABLE samples 
  ALTER COLUMN snr TYPE DECIMAL(10,2),
  ALTER COLUMN rssi TYPE DECIMAL(10,2);

-- Update coverage table
ALTER TABLE coverage
  ALTER COLUMN snr TYPE DECIMAL(10,2),
  ALTER COLUMN rssi TYPE DECIMAL(10,2);

-- Update coverage_samples table
ALTER TABLE coverage_samples
  ALTER COLUMN sample_snr TYPE DECIMAL(10,2),
  ALTER COLUMN sample_rssi TYPE DECIMAL(10,2);

-- Update archive table
ALTER TABLE archive
  ALTER COLUMN snr TYPE DECIMAL(10,2),
  ALTER COLUMN rssi TYPE DECIMAL(10,2);
