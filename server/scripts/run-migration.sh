#!/bin/bash
# Run a specific migration file against the database
# Usage: ./run-migration.sh <migration_file>

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <migration_file>"
  echo "Example: $0 migrations/006_add_packet_paths.sql"
  exit 1
fi

MIGRATION_FILE="$1"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "Error: Migration file not found: $MIGRATION_FILE"
  exit 1
fi

# Get container name (supports both default and custom instance names)
CONTAINER_NAME=$(docker ps --filter "name=meshmap-db" --format "{{.Names}}" | head -n 1)

if [ -z "$CONTAINER_NAME" ]; then
  echo "Error: Could not find meshmap-db container. Is it running?"
  exit 1
fi

echo "Running migration: $MIGRATION_FILE"
echo "Container: $CONTAINER_NAME"

# Read DB credentials from .env if available, or use defaults
if [ -f "server/.env" ]; then
  source server/.env
fi

DB_USER=${DB_USER:-meshmap}
DB_NAME=${DB_NAME:-meshmap}

# Run the migration
docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" < "$MIGRATION_FILE"

echo "Migration completed successfully!"
