#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
for file in gateway.env native.env opencode.json admin-gateway.env admin-native.env admin-opencode.json platform.json tls.key tls.crt; do
 test -s "runtime/$file" || { echo "Missing administrator configuration: runtime/$file" >&2; exit 1; }
done
for label in admin native; do mountpoint -q "runtime/disks/$label" || { echo "Missing bounded filesystem: $label" >&2; exit 1; }; done
docker compose ps
for service in native-guard admin-native-guard; do
 docker compose exec -T "$service" node -e "fetch('http://localhost:4096/global/health',{headers:{Authorization:'Basic '+Buffer.from('opencode:'+process.env.OPENCODE_SERVER_PASSWORD).toString('base64')},signal:AbortSignal.timeout(5000)}).then(async r=>{console.log(r.status,await r.text());if(!r.ok)process.exit(1)}).catch(()=>process.exit(1));"
done
