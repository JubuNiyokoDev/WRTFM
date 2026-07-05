#!/bin/bash
# Database backup script
# Uses pg_dump to backup the database schema and data

set -e

# Default backup directory
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"

# Timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/cae_db_backup_$TIMESTAMP.sql"

echo "Starting database backup..."

if [ -n "$DATABASE_URL" ]; then
  pg_dump "$DATABASE_URL" > "$BACKUP_FILE"
else
  # Use default CAE postgres credentials if no URL is provided
  pg_dump -h localhost -p 5433 -U cae cae > "$BACKUP_FILE"
fi

echo "Database backup completed successfully: $BACKUP_FILE"
