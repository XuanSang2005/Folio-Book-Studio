#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir"

node scripts/require-node-version.mjs

export NODE_ENV=production
export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-3001}"

npm run build

printf 'Starting Gradion Folio at http://%s:%s\n' "$HOST" "$PORT"
exec npm run start --workspace @gradion-folio/backend

