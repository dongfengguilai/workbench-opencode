#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
local_browser=false
case "${1:-}" in
 '') ;;
 --local-browser) local_browser=true ;;
 *) echo 'Usage: start.sh [--local-browser]' >&2; exit 1 ;;
esac
test "$#" -le 1 || { echo 'Usage: start.sh [--local-browser]' >&2; exit 1; }
for file in gateway.env native.env opencode.json admin-gateway.env admin-native.env admin-opencode.json platform.json tls.key tls.crt; do
 test -s "runtime/$file" || { echo "Missing administrator configuration: runtime/$file" >&2; exit 1; }
done
python3 scripts/quota.py --migrate-stopped
# Always recreate the guards and their UID firewall with native network namespaces.
# Work and original native state are bind mounts; initialization is a separate command.
docker compose --profile model-repair up -d --no-build --force-recreate
./scripts/status.sh
if "$local_browser"; then python3 scripts/local-browser.py start; fi
