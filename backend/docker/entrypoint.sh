#!/usr/bin/env sh
set -e

# Wait for Postgres if configured.
if [ "${DB_ENGINE}" = "postgres" ]; then
  echo "Waiting for Postgres at ${DB_HOST}:${DB_PORT}..."
  python - <<'PY'
import os, socket, sys, time
host = os.environ.get("DB_HOST", "db")
port = int(os.environ.get("DB_PORT", "5432"))
deadline = time.time() + 60
while time.time() < deadline:
    try:
        with socket.create_connection((host, port), timeout=2):
            print(f"Postgres reachable at {host}:{port}")
            sys.exit(0)
    except OSError:
        time.sleep(1)
print("Timed out waiting for Postgres", file=sys.stderr)
sys.exit(1)
PY
fi

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  echo "Running migrations..."
  python manage.py migrate --noinput
fi

if [ "${RUN_COLLECTSTATIC:-1}" = "1" ]; then
  echo "Collecting static files..."
  python manage.py collectstatic --noinput
fi

exec "$@"
