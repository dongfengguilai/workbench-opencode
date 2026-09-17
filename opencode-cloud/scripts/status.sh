#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
for file in runtime/gateway.env runtime/native.env runtime/opencode.json; do
  test -s "$file" || { echo "Missing administrator configuration: $file" >&2; exit 1; }
done
docker compose ps
docker compose exec -T native python3 -c 'import os,urllib.request,base64; req=urllib.request.Request("http://localhost:4096/global/health",headers={"Authorization":"Basic "+base64.b64encode(("opencode:"+os.environ["OPENCODE_SERVER_PASSWORD"]).encode()).decode()}); print(urllib.request.urlopen(req,timeout=5).read().decode())'
