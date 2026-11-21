#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Node.js 22.11 or newer is required.' >&2
  exit 1
fi
exec node --env-file-if-exists=.env server.mjs