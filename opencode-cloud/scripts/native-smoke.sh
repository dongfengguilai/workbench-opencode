#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
# Operator-only Docker exec uses UID1001 to reach the protected raw loopback.
# User code remains UID1000 and cannot take this route. No platform run database.
trial_name="native-smoke-$(date +%s)"
docker compose exec -T --user 1001:1001 -e "XDG_DATA_HOME=/tmp/$trial_name/data" -e "XDG_STATE_HOME=/tmp/$trial_name/state" -e "XDG_CACHE_HOME=/tmp/$trial_name/cache" admin-native opencode run --attach http://localhost:4030 --dir /workspace/project --model approved/gpt-5.6-luna --format json 'Run node --experimental-strip-types --test opencode-cloud/test/patch-export.test.mjs. Do not modify project files, read secrets, commit, or access external services. Report actual results.'
