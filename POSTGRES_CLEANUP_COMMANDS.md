# PostgreSQL Cleanup Commands

## 1. Delete Repeaters Not Updated in 2 Weeks

This deletes repeaters that haven't been updated (based on their `time` field) in the last 2 weeks:

```sql
-- Delete repeaters not updated in 2 weeks (14 days)
-- Uses the 'time' field which is stored as BIGINT (milliseconds since epoch)
DELETE FROM repeaters 
WHERE time < EXTRACT(EPOCH FROM NOW() - INTERVAL '14 days') * 1000;
```

**Alternative using updated_at timestamp:**
```sql
-- If you prefer to use the updated_at timestamp instead:
DELETE FROM repeaters 
WHERE updated_at < NOW() - INTERVAL '14 days';
```

**Preview before deleting (recommended):**
```sql
-- See how many repeaters would be deleted
SELECT COUNT(*) FROM repeaters 
WHERE time < EXTRACT(EPOCH FROM NOW() - INTERVAL '14 days') * 1000;

-- See which repeaters would be deleted
SELECT id, lat, lon, name, 
       to_timestamp(time / 1000) as last_updated,
       updated_at
FROM repeaters 
WHERE time < EXTRACT(EPOCH FROM NOW() - INTERVAL '14 days') * 1000
ORDER BY time;
```

---

## 2. Delete Samples and Repeaters Outside Lat/Lon Range

### For Repeaters (direct lat/lon columns):

```sql
-- Delete repeaters outside a bounding box
-- Adjust the lat/lon values to match your area
-- Example: San Francisco Bay Area (37.0 to 38.0 lat, -123.0 to -121.0 lon)
DELETE FROM repeaters 
WHERE lat < 37.0 OR lat > 38.0 
   OR lon < -123.0 OR lon > -121.0;
```

**Preview before deleting:**
```sql
-- See how many repeaters would be deleted
SELECT COUNT(*) FROM repeaters 
WHERE lat < 37.0 OR lat > 38.0 
   OR lon < -123.0 OR lon > -121.0;

-- See which repeaters would be deleted
SELECT id, lat, lon, name, 
       to_timestamp(time / 1000) as last_updated
FROM repeaters 
WHERE lat < 37.0 OR lat > 38.0 
   OR lon < -123.0 OR lon > -121.0
ORDER BY lat, lon;
```

### For Samples (geohash-based):

Since samples store location as geohash, you have two options:

**Option A: Delete by geohash prefix (simpler, less precise)**
```sql
-- Delete samples with geohash prefixes outside your area
-- This requires knowing which geohash prefixes correspond to your area
-- Example: Delete samples not starting with prefixes for your region
-- (You'll need to determine the valid prefixes for your area)
DELETE FROM samples 
WHERE geohash NOT LIKE '9q%'  -- Example: keep only 9q prefix (SF Bay Area)
  AND geohash NOT LIKE '9r%'  -- Add other valid prefixes for your area
  AND geohash NOT LIKE '9p%';
```

**Option B: Use a PostgreSQL function to decode geohash (more precise)**

First, install the PostGIS extension (if available) or use a geohash decoding function:

```sql
-- If you have PostGIS, you can use this approach:
-- (This requires PostGIS extension to be installed)

-- For samples, you'd need to decode geohash to lat/lon
-- Since PostgreSQL doesn't have built-in geohash decode, 
-- you may need to use a custom function or filter by prefix ranges

-- Alternative: Delete samples by geohash prefix ranges
-- Determine the valid geohash prefixes for your bounding box
-- and delete everything else
DELETE FROM samples 
WHERE LEFT(geohash, 2) NOT IN ('9q', '9r', '9p', '9n', '9m');  -- Adjust to your area
```

**Recommended approach for samples:**
Since geohash decoding in pure SQL is complex, consider using a script. But for quick SQL cleanup, use the prefix approach:

```sql
-- Preview samples that would be deleted (by invalid prefix)
-- Adjust the valid prefixes list to match your area
SELECT geohash, 
       to_timestamp(time / 1000) as sample_time,
       path
FROM samples 
WHERE LEFT(geohash, 2) NOT IN ('9q', '9r', '9p', '9n', '9m')  -- Adjust prefixes
ORDER BY geohash
LIMIT 100;  -- Preview first 100

-- Then delete:
DELETE FROM samples 
WHERE LEFT(geohash, 2) NOT IN ('9q', '9r', '9p', '9n', '9m');  -- Adjust prefixes
```

---

## Quick Reference: Finding Your Geohash Prefixes

To find valid geohash prefixes for your area, you can:

1. Use an online geohash tool to find prefixes for your bounding box
2. Check existing samples to see what prefixes are in your valid area:
```sql
-- See distribution of geohash prefixes in your current data
SELECT LEFT(geohash, 2) as prefix, COUNT(*) as count
FROM samples
GROUP BY LEFT(geohash, 2)
ORDER BY count DESC;
```

---

## Notes:

- **Always preview with SELECT before running DELETE**
- **Consider backing up your database before running these commands**
- **The time field is in milliseconds** (BIGINT), so we multiply by 1000 when converting from epoch seconds
- **For samples**, the geohash prefix approach is approximate but practical for SQL-only cleanup
- **For precise sample cleanup**, you may want to use a Node.js script that can decode geohash properly
