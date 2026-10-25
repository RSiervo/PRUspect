#!/usr/bin/env bash
# Nightly PostgreSQL backup for PRUspect (Linux server).
# Usage: DATABASE_URL=postgres://... ./scripts/backup.sh /var/backups/pruspect
# Cron:  15 2 * * *  pruspect  DATABASE_URL=... /srv/pruspect/scripts/backup.sh /var/backups/pruspect
set -euo pipefail

DEST="${1:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
: "${DATABASE_URL:?Set DATABASE_URL}"

umask 077                      # backups contain personal data — owner-only permissions
mkdir -p "$DEST"
FILE="$DEST/pruspect-$(date +%Y%m%d-%H%M%S).dump"

pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file="$FILE"
pg_restore --list "$FILE" > /dev/null   # sanity check the archive is readable
echo "Backup written: $FILE"

find "$DEST" -name 'pruspect-*.dump' -mtime +"$KEEP_DAYS" -delete
# Copy $DEST off the server (encrypted) — a backup on the same disk is not a backup.
