# Environment Configuration

**See `.env.example` for the complete configuration template with all available options.**

This document provides additional details and explanations for environment variables.

## Quick Start

1. Copy the example file: `cp .env.example .env`
2. Edit `.env` with your actual values
3. For Docker: The `docker-compose.yml` automatically loads `.env` file

## Location Validation Settings

The application can optionally validate that locations are within a certain distance from a center point. By default, validation is disabled (no distance limit).

### Default Behavior

- **Center**: San Jose, CA (37.3382, -121.8863)
- **Max Distance**: 0 (no limit - accepts locations from anywhere)

### Enable Location Validation

To restrict locations to a specific region, set in `.env`:

```bash
CENTER_POS=37.3382,-121.8863
MAX_DISTANCE_MILES=100
```

Where:
- `CENTER_POS` - Center point in "lat,lon" format
- `MAX_DISTANCE_MILES` - Maximum distance in miles from center (set to 0 to disable)

## Initial Map Zoom Settings

- **Zoom Level**: 10 (Shows approximated 9100 square miles on a 1920x1080 screen)

### Change Initial Zoom Level

To display a different map zoom level on page load:

```bash
INITIAL_ZOOM_LEVEL=12
```

Where:
- `INITIAL_ZOOM_LEVEL` - Initial map zoom level, higher numbers zoom in more and show less square miles.

## Maintenance Task Configuration

### Consolidate Task

Automatically moves old samples into coverage tiles and archives them:

```bash
CONSOLIDATE_ENABLED=true
CONSOLIDATE_SCHEDULE=0 2 * * *  # Daily at 2 AM (cron format)
CONSOLIDATE_MAX_AGE_DAYS=14     # Samples older than 14 days (2 weeks) will be consolidated
```

### Cleanup Task

Automatically removes stale repeaters and deduplicates:

```bash
CLEANUP_ENABLED=true
CLEANUP_SCHEDULE=0 3 * * 0      # Weekly on Sunday at 3 AM
```

### Cron Schedule Format

The schedule uses standard cron format: `minute hour day month weekday`

Examples:
- `0 2 * * *` - Daily at 2:00 AM
- `0 3 * * 0` - Weekly on Sunday at 3:00 AM
- `0 */6 * * *` - Every 6 hours
- `0 0 1 * *` - First day of each month at midnight

To disable a task, set `ENABLED=false`.

