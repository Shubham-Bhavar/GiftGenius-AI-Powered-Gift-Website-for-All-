#!/bin/sh
# Nightly logical backup of the giftgenius database, kept for BACKUP_KEEP_DAYS days.
# Restore (from the project folder, with .env loaded):
#   gunzip -c backups/giftgenius-YYYY-MM-DD-HHMM.sql.gz | docker compose exec -T -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql mysql -u root giftgenius
set -eu
# Fail the backup (not just gzip) if mysqldump fails.
set -o pipefail
KEEP="${BACKUP_KEEP_DAYS:-14}"
while true; do
  STAMP="$(date -u +%Y-%m-%d-%H%M)"
  OUT="/backups/giftgenius-$STAMP.sql.gz"
  if mysqldump -h mysql -u root --single-transaction --routines --triggers --no-tablespaces giftgenius | gzip > "$OUT.part"; then
    mv "$OUT.part" "$OUT"
    echo "$(date -u) backup ok: $OUT"
  else
    rm -f "$OUT.part"
    echo "$(date -u) BACKUP FAILED" >&2
  fi
  find /backups -name 'giftgenius-*.sql.gz' -mtime "+$KEEP" -delete
  sleep 86400
done
