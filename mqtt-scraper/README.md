# MQTT Scraper

This directory contains scripts for scraping wardrive data from MQTT feeds and maintaining the coverage map database.

## Files

- **wardrive-mqtt.py** - Main MQTT scraper that watches for wardrive submissions and repeater adverts
- **wardrive-maint.py** - Maintenance script for consolidating samples and cleaning up stale data
- **config.json** - Configuration file for MQTT broker, service host, and observer settings

## Setup

### Install Dependencies

```bash
pip install paho-mqtt requests haversine cryptography
```

### Configuration

Edit `config.json` to configure:

- **MQTT Settings**: Broker host, port, authentication, topics
- **Service Host**: URL of the coverage map API (default: `http://localhost:3000`)
- **Center Position**: Geographic center for distance validation (Alviso, CA: `[37.4241, -121.9756]`)
- **Watched Observers**: List of observer names to monitor

### MQTT Modes

#### Public Mode (letsmesh.net)
- Uses WebSockets over TLS (port 443)
- Requires authentication
- Topics: `meshcore/SFO/+/packets`, `meshcore/SJC/+/packets`

#### Local Mode (mosquitto)
- Standard MQTT (port 1883)
- No authentication required
- Useful for testing/development

To use local mode, set in `config.json`:
```json
{
  "mqtt_mode": "local",
  "mqtt_host": "localhost",
  "mqtt_port": 1883,
  "mqtt_use_websockets": false,
  "mqtt_use_tls": false
}
```

## Running

### MQTT Scraper

```bash
cd mqtt-scraper
python wardrive-mqtt.py
```

The scraper will:
- Connect to the configured MQTT broker
- Subscribe to the configured topics
- Watch for messages from the specified observers
- Process ADVERT packets (repeater locations)
- Process GROUP_MSG packets (wardrive location samples)
- Post data to the service API

### Maintenance Script

**Note**: Maintenance tasks are now automated in the server (see server README). This script is optional for manual runs.

Run manually to trigger maintenance tasks:

```bash
cd mqtt-scraper
python wardrive-maint.py
```

Or set the service host and max age via environment variables:
```bash
SERVICE_HOST=http://localhost:3000 CONSOLIDATE_MAX_AGE_DAYS=7 python wardrive-maint.py
```

The script will:
- Consolidate samples older than the configured age (default: 14 days)
- Clean up stale repeaters

## Docker Setup

If using Docker Compose, the scraper is included in `docker-compose.yml`:

```bash
docker-compose up mqtt-scraper
```

This starts a local mosquitto broker on:
- Port 1883 (standard MQTT)
- Port 9001 (WebSockets)

## Configuration Options

### Service Host

The service host can be configured via:
1. Environment variable: `SERVICE_HOST`
2. `config.json`: `service_host` field
3. Default: `http://localhost:3000`

### MQTT Topics

For Bay Area, the scraper watches:
- `meshcore/SFO/+/packets` - San Francisco region
- `meshcore/SJC/+/packets` - San Jose region

### Watched Observers

Currently configured to watch:
- "OHMC Repeater"
- "Ruth Bader Ginsburg"
- "Nullrouten observer"

Only messages from these observers will be processed.

## Troubleshooting

### Connection Issues

- Check MQTT broker is running and accessible
- Verify credentials in `config.json` (for public mode)
- For local mode, ensure mosquitto is running

### No Messages Processed

- Verify observer names match exactly (case-sensitive)
- Check that topics are correct for your region
- Ensure the service API is running and accessible

### Service API Errors

- Verify `service_host` is correct
- Check that the API server is running
- Review API logs for error details

