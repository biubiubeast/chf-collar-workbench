#!/usr/bin/env bash
set -euo pipefail
umask 077
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(git -C "$SOURCE_DIR" rev-parse --show-toplevel)"
APP_ROOT="${FXCOLLAR_APP_ROOT:-/home/bill/apps/fxcollar}"
BRANCH="deploy/ubuntu-fxcollar"
[ "$(git -C "$REPO_DIR" branch --show-current)" = "$BRANCH" ] || { echo "Switch to $BRANCH first" >&2; exit 1; }
[ -z "$(git -C "$REPO_DIR" status --porcelain --untracked-files=no)" ] || { echo 'Tracked source has local changes; stopping.' >&2; exit 1; }
cd "$SOURCE_DIR"
node -e 'const v=process.versions.node.split(".").map(Number);if(v[0]<22||(v[0]===22&&v[1]<13))throw Error("Node >=22.13 required")'
node --input-type=module -e 'import {loadConfig} from "./ubuntu/config.mjs";loadConfig()' </dev/null
command -v pm2 >/dev/null
mkdir -p "$APP_ROOT/releases" "$APP_ROOT/backups"
exec 9>"$APP_ROOT/deploy.lock"
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }
git -C "$REPO_DIR" pull --ff-only origin "$BRANCH"
COMMIT="$(git -C "$REPO_DIR" rev-parse HEAD)"
RELEASE="$APP_ROOT/releases/$(date -u +%Y%m%dT%H%M%SZ)-${COMMIT:0:12}"
mkdir -p "$RELEASE/source"
git -C "$REPO_DIR" archive "$COMMIT" | tar -x -C "$RELEASE/source"
cd "$RELEASE/source/chf-collar-workbench-b"
corepack pnpm install --frozen-lockfile
corepack pnpm test
corepack pnpm typecheck --incremental false
NEXT_PUBLIC_BASE_PATH=/FXCollar NEXT_TELEMETRY_DISABLED=1 corepack pnpm build:ubuntu
cp -a .next/standalone "$RELEASE/app"
mkdir -p "$RELEASE/app/.next"
cp -a .next/static "$RELEASE/app/.next/static"
cp -a public "$RELEASE/app/public"
cp -a ubuntu "$RELEASE/ubuntu"
printf '%s\n' "$COMMIT" > "$RELEASE/COMMIT"
# Imports are explicit and only into an empty target. Secrets/configurations are
# read from the ignored server configuration, never from GitHub.
node ubuntu/backup.mjs "$APP_ROOT/backups"
if [ -n "${FXCOLLAR_IMPORT:-}" ]; then node ubuntu/profiles.mjs "$FXCOLLAR_IMPORT"; fi
node --input-type=module -e 'import {loadConfig} from "./ubuntu/config.mjs";import {openDatabase} from "./lib/ubuntu-db.mjs";const d=openDatabase(loadConfig().SQLITE_PATH);const r=await d.prepare("SELECT COUNT(*) AS n FROM client_display WHERE id IN (1,2)").first();d.close();if(r.n!==2)throw Error("Both original profiles must be imported before initial publication")'
PORT_VALUE="$(node --input-type=module -e 'import {loadConfig} from "./ubuntu/config.mjs";console.log(loadConfig().PORT)')"
CANDIDATE_PORT="$((PORT_VALUE+1))"
FXCOLLAR_CANDIDATE_PORT="$CANDIDATE_PORT" node ubuntu/serve.mjs "$RELEASE/app/server.js" > "$RELEASE/candidate.log" 2>&1 &
CANDIDATE_PID="$!"
cleanup(){ kill "$CANDIDATE_PID" 2>/dev/null || true; }
trap cleanup EXIT
READY=''
for _ in $(seq 40); do
  kill -0 "$CANDIDATE_PID" 2>/dev/null || { echo 'Candidate failed; see candidate.log' >&2; exit 1; }
  if curl --max-time 2 -fsS "http://127.0.0.1:$CANDIDATE_PORT/FXCollar/login" -o /dev/null; then READY=1; break; fi
  sleep 1
done
[ -n "$READY" ] || { echo 'Candidate readiness failed' >&2; exit 1; }
node ubuntu/healthcheck.mjs "http://127.0.0.1:$CANDIDATE_PORT"
cleanup
wait "$CANDIDATE_PID" || true
trap - EXIT
PREVIOUS="$(readlink "$APP_ROOT/current" || true)"
ln -s "$RELEASE" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"
# The stable launcher follows the atomic current symlink on every PM2 restart.
cat > "$APP_ROOT/serve.mjs" <<'JS'
import './current/ubuntu/serve.mjs';
JS
if pm2 describe fxcollar >/dev/null 2>&1; then
  pm2 restart fxcollar --update-env
else
  pm2 start "$APP_ROOT/serve.mjs" --name fxcollar --cwd "$APP_ROOT" --interpreter "$(command -v node)"
fi
SUCCESS=''
for _ in $(seq 20); do
  if node "$RELEASE/ubuntu/healthcheck.mjs" "http://127.0.0.1:$PORT_VALUE"; then SUCCESS=1; break; fi
  sleep 1
done
if [ -z "$SUCCESS" ]; then
  if [ -n "$PREVIOUS" ]; then
    ln -s "$PREVIOUS" "$APP_ROOT/current.rollback"
    mv -Tf "$APP_ROOT/current.rollback" "$APP_ROOT/current"
    pm2 restart fxcollar --update-env
    echo "Restored previous release: $PREVIOUS" >&2
  else pm2 stop fxcollar; fi
  exit 1
fi
pm2 save
printf 'Deployment healthy. Commit: %s\n' "$COMMIT"
printf 'Public URL after Caddy routing: https://bill.spailab.com/FXCollar/\n'
