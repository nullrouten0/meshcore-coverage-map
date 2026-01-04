# MeshCore Coverage Map - Self-Hosted

Self-hosted version of the MeshCore Coverage Map, migrated from Cloudflare to Node.js/Express with PostgreSQL.

## Prerequisites

**Only Docker and Docker Compose are required.** No Node.js, npm, or PostgreSQL installation needed.

### Install Docker on Ubuntu/EC2

```bash
# Update system
sudo apt update
sudo apt upgrade -y

# Install Docker
sudo apt install -y docker.io docker-compose

# Start and enable Docker
sudo systemctl enable docker
sudo systemctl start docker

# Add your user to docker group (to run without sudo)
sudo usermod -aG docker $USER

# Log out and back in for group changes to take effect
exit
```

**Reconnect via SSH** after logging out.

### Verify Docker Installation

```bash
docker --version
docker-compose --version
```

## Quick Start

```bash
# 1. Clone the repository
git clone <repository-url>
cd meshcore-coverage-map

# 2. Configure environment
cp server/.env.example server/.env
# Edit server/.env with your settings (optional for development)

# 3. Start the application
./docker-compose.sh up --build
```

The application will be available at `http://localhost:3000`

**Note:** This project uses `./docker-compose.sh` instead of `docker-compose` directly. The helper script automatically loads `server/.env` for Docker Compose variable substitution, which is required for database credentials and other configuration.

## Development

```bash
cp server/.env.example server/.env  # Edit with your settings if needed
./docker-compose.sh up --build
```

**Useful commands:**
- `./docker-compose.sh up -d --build` - Run in background
- `./docker-compose.sh logs -f` - View logs
- `./docker-compose.sh down` - Stop containers
- `./docker-compose.sh restart` - Restart containers

## Production

1. **Configure environment:**
   ```bash
   cp server/.env.example server/.env
   # Edit server/.env with production values
   ```

2. **Stop any existing containers:**
   ```bash
   ./docker-compose.sh -f docker-compose.prod.yml down
   ```

3. **Start services:**
   ```bash
   ./docker-compose.sh -f docker-compose.prod.yml up -d --build
   ```

## Configuration

Edit `server/.env` (copy from `server/.env.example`). The `server/.env.example` file includes:

```bash
# Instance Configuration (for running multiple instances on same host)
INSTANCE_NAME=default
HTTP_PORT=3000
HTTPS_PORT=3443
DB_PORT=5432

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=meshmap
DB_USER=meshmap
DB_PASSWORD=your_password

# Server Configuration
PORT=3000
HTTPS_PORT=3443
NODE_ENV=production

# Location validation (optional)
CENTER_POS=37.3382,-121.8863
MAX_DISTANCE_MILES=0  # 0 = no limit

# Automated maintenance
CONSOLIDATE_ENABLED=true
CONSOLIDATE_SCHEDULE=0 2 * * *  # Daily at 2 AM
CONSOLIDATE_MAX_AGE_DAYS=14
CLEANUP_ENABLED=true
CLEANUP_SCHEDULE=0 3 * * 0  # Weekly Sunday at 3 AM
```

**Note:** `DB_NAME` and `DB_USER` default to `${INSTANCE_NAME:-meshmap}` if not explicitly set, allowing instance-specific databases.

## Running Multiple Instances

You can run multiple instances (e.g., "west" and "east") on the same host. Docker Compose automatically isolates resources by project name (directory name by default). Each instance needs unique configuration:

**Option 1: Separate directories (recommended)**
Run each instance from a different directory. Docker Compose will automatically prefix volumes and networks with the directory name.

**West instance** (`server/.env` in west-instance directory):
```bash
INSTANCE_NAME=west
HTTP_PORT=3000
HTTPS_PORT=3443
DB_PORT=5432
DB_NAME=west_meshmap
DB_USER=west_meshmap
DB_PASSWORD=west_password
```

**East instance** (`server/.env` in east-instance directory):
```bash
INSTANCE_NAME=east
HTTP_PORT=3001
HTTPS_PORT=3444
DB_PORT=5433
DB_NAME=east_meshmap
DB_USER=east_meshmap
DB_PASSWORD=east_password
```

**Option 2: Same directory, different project names**
Use the `-p` flag to set different project names:
```bash
# West instance
./docker-compose.sh -p west up --build

# East instance  
./docker-compose.sh -p east up --build
```

This ensures:
- Unique container names (`west-meshmap-db`, `east-meshmap-db`, etc.)
- Unique ports (no conflicts)
- Separate Docker volumes (prefixed by project name: `west_postgres_data`, `east_postgres_data`)
- Separate networks (prefixed by project name: `west_meshmap-network`, `east_meshmap-network`)
- Separate databases

## MQTT Scraper

For automatic data collection from MQTT feeds:

1. **Configure:**
   ```bash
   cd mqtt-scraper
   cp config.json.example config.json
   # Edit config.json with MQTT credentials
   ```

2. **Start with Docker:**
   ```bash
   ./docker-compose.sh up -d mqtt-scraper
   ./docker-compose.sh logs -f mqtt-scraper
   ```

**Configuration example:**
```json
{
  "mqtt_mode": "public",
  "mqtt_host": "mqtt-us-v1.letsmesh.net",
  "mqtt_port": 443,
  "mqtt_use_websockets": true,
  "mqtt_use_tls": true,
  "mqtt_username": "YOUR_USERNAME",
  "mqtt_password": "YOUR_PASSWORD",
  "mqtt_topics": ["meshcore/SFO/+/packets"],
  "service_host": "http://app:3000",
  "watched_observers": ["OHMC Repeater"]
}
```

## API Endpoints

- `GET /get-nodes` - Get all coverage, samples, and repeaters
- `GET /get-coverage` - Get coverage data
- `GET /get-samples?p=<prefix>` - Get samples (filtered by geohash prefix)
- `GET /get-repeaters` - Get all repeaters
- `POST /put-sample` - Add/update a sample
- `POST /put-repeater` - Add/update a repeater
- `POST /consolidate?maxAge=<days>` - Consolidate old samples
- `POST /clean-up?op=repeaters` - Clean up stale repeaters

## Frontend

Access the map and tools at:
- `http://localhost:3000/` - Main coverage map
- `http://localhost:3000/addSample.html` - Add sample
- `http://localhost:3000/addRepeater.html` - Add repeater
- `http://localhost:3000/wardrive.html` - Wardrive app

## migrating samples from an old instance to a new instance.

# Use default URLs (in script)
cd server
node scripts/migrate-samples.js

# Or specify custom URLs
node scripts/migrate-samples.js --source https://source.domain.com/get-samples --dest https://dest.domain.com/put-sample

# Add delay between requests (useful for rate limiting)
node scripts/migrate-samples.js --delay 100

## Troubleshooting

**Database connection issues:**
```bash
# For default instance
docker exec default-meshmap-db psql -U meshmap -d meshmap

# For named instance (e.g., "west")
docker exec west-meshmap-db psql -U west_meshmap -d west_meshmap
```

**Port already in use:**
Change `HTTP_PORT` in `.env` or stop the process using the port.

**Docker permission denied:**
```bash
sudo usermod -aG docker $USER
exit  # Reconnect
```

**Docker Compose "ContainerConfig" error:**
```bash
./docker-compose.sh -f docker-compose.prod.yml down
./docker-compose.sh -f docker-compose.prod.yml up -d --build
```

**View logs:**
```bash
# For default instance
./docker-compose.sh logs -f app
./docker-compose.sh logs -f db
./docker-compose.sh logs -f mqtt-scraper

# For named instance, use container names
docker logs -f west-meshmap-app
docker logs -f west-meshmap-db
```

## License

See LICENSE file in the root directory.
