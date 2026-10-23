#!/usr/bin/env bash
# Starts the local Foundry VTT server used for development and end-to-end tests.
# Paths and port come from .env.local (see .env.example).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=/dev/null
[[ -f "$root/.env.local" ]] && source "$root/.env.local"

app_dir="${FOUNDRY_APP_DIR:-$HOME/foundry/vtt}"
data_dir="${FOUNDRY_DATA_DIR:-$HOME/foundry/data}"
port="${FOUNDRY_PORT:-30000}"
app_dir="${app_dir/#\~/$HOME}"
data_dir="${data_dir/#\~/$HOME}"

if [[ ! -f "$app_dir/main.js" ]]; then
  echo "Foundry not found at $app_dir (set FOUNDRY_APP_DIR in .env.local)" >&2
  exit 1
fi
mkdir -p "$data_dir"

exec node "$app_dir/main.js" --dataPath="$data_dir" --port="$port" --noupnp --noupdate
