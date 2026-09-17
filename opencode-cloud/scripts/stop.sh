#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
python3 scripts/local-browser.py stop
python3 scripts/local-preview.py stop
docker compose --profile model-repair stop
