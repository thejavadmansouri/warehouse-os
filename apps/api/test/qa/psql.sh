#!/usr/bin/env bash
# Internal helper: run psql on the QA database using credentials from .env (never echoed to logs).
# Usage: test/qa/psql.sh -c "SQL"  |  test/qa/psql.sh -f file.sql  |  test/qa/psql.sh "SELECT 1"
set -euo pipefail
cd "$(dirname "$0")/../.."

PSQL_BIN="$(command -v psql || echo /Library/PostgreSQL/18/bin/psql)"
PGPASSWORD="$(node -e '
const fs=require("fs");
const m=fs.readFileSync(".env","utf8").match(/^DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/m);
if(!m) process.exit(1);
process.stdout.write(new URL(m[1]).password);
')"
export PGPASSWORD

exec "$PSQL_BIN" -h localhost -p 5432 -U postgres -d warehouse_os_qa -v ON_ERROR_STOP=1 -t -A "$@"