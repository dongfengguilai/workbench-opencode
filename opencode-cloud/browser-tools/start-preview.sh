#!/bin/bash
set -euo pipefail
mkdir -p /workspace/project/.workbench-artifacts /state/browser-home /state/browser-config /state/browser-cache
cd /workspace/project/web
# A single native PTY owns this pipeline and its process group.
if test -f package.json; then
  node --input-type=module -e 'import fs from "node:fs"; const p=JSON.parse(fs.readFileSync("package.json")); if(p.scripts?.dev!=="vite" || !fs.existsSync("package-lock.json") || !fs.existsSync("node_modules/vite/package.json")) throw Error("React preview requires a locked local Vite installation and dev script: vite");'
  npm run dev -- --configLoader native --config /trusted/vite.config.mjs --host 127.0.0.1 --port 5173 --strictPort 2>&1 | tee /workspace/project/.workbench-artifacts/preview.log
else
  vite --configLoader native --config /trusted/vite.config.mjs 2>&1 | tee /workspace/project/.workbench-artifacts/preview.log
fi
