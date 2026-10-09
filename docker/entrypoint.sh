#!/bin/sh
set -eu
export DATA_DIR="${DATA_DIR:-/data}"
export DATABASE_URL="${DATABASE_URL:-file:$DATA_DIR/opentracker.db}"
export HOME=/tmp
umask "${UMASK:-002}"
if [ "$(id -u)" = "0" ]; then
  case "${PUID:-99}:${PGID:-100}" in
    *[!0-9:]*|:*|*:) echo 'PUID and PGID must be numeric' >&2; exit 1 ;;
  esac
  mkdir -p "$DATA_DIR"
  chown -R "${PUID:-99}:${PGID:-100}" "$DATA_DIR"
  exec gosu "${PUID:-99}:${PGID:-100}" "$0" "$@"
fi
./node_modules/.bin/prisma migrate deploy
exec "$@"
