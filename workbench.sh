#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ "${1:-}" != dev ]]; then
  echo 'Usage: ./workbench.sh dev setup|start|status|stop|reset-admin-password [--project PATH] [--check] [--resume]' >&2
  exit 2
fi
shift
exec python3 "$repo_dir/opencode-cloud/scripts/dev-workbench.py" "$@"
