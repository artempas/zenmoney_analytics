#!/bin/sh
# Starts the app as an unprivileged user that owns the data directory.
#
# Host folders mounted into /data (e.g. a Synology shared folder) are usually owned by a
# different uid than the one inside the image, and SQLite then fails with SQLITE_CANTOPEN.
# When started as root, this script hands DATA_DIR to PUID:PGID and drops privileges.
set -eu

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
DATA_DIR="${DATA_DIR:-/data}"

if [ "$(id -u)" != "0" ]; then
  # Started with an explicit --user: nothing to fix, the app reports a clear error if needed.
  exec "$@"
fi

mkdir -p "$DATA_DIR"
if [ "$PUID" != "0" ]; then
  if [ -n "$(find "$DATA_DIR" \( ! -user "$PUID" -o ! -group "$PGID" \) -print -quit)" ]; then
    echo "Setting owner of $DATA_DIR to $PUID:$PGID"
    chown -R "$PUID:$PGID" "$DATA_DIR" ||
      echo "Warning: could not change owner of $DATA_DIR; make it writable for uid $PUID or set PUID/PGID to its owner" >&2
  fi
  exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups "$@"
fi

exec "$@"
