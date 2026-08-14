#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir"

node scripts/require-node-version.mjs

phase5_tmp="$(mktemp -d "${TMPDIR:-/tmp}/gradion-folio-phase5.XXXXXX")"
server_pid=""

cleanup() {
  if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
    kill -TERM "$server_pid" 2>/dev/null || true
    for _attempt in {1..50}; do
      if ! kill -0 "$server_pid" 2>/dev/null; then
        break
      fi
      sleep 0.1
    done
    if kill -0 "$server_pid" 2>/dev/null; then
      kill -KILL "$server_pid" 2>/dev/null || true
    fi
  fi
  if [[ -n "$server_pid" ]]; then
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -rf -- "$phase5_tmp"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

export GEMINI_API_KEY=

npm run typecheck
npm run lint
npm test
npm run build
npm audit --omit=dev
npm audit

smoke_port="$(node scripts/find-open-port.mjs)"
smoke_data="$phase5_tmp/data"
smoke_database="$phase5_tmp/folio.sqlite"

NODE_ENV=production \
HOST=127.0.0.1 \
PORT="$smoke_port" \
DATA_DIR="$smoke_data" \
DATABASE_PATH="$smoke_database" \
GEMINI_API_KEY= \
LOG_LEVEL=warn \
./start.sh >"$phase5_tmp/server.log" 2>&1 &
server_pid="$!"

if ! BASE_URL="http://127.0.0.1:$smoke_port" \
  SMOKE_DATA_DIR="$smoke_data" \
  node scripts/smoke-built-server.mjs; then
  sed -n '1,240p' "$phase5_tmp/server.log"
  exit 1
fi

printf 'Phase 5 verification passed.\n'

