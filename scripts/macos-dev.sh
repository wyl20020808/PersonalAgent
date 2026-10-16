#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$ROOT/node_modules/.bin:$ROOT/desktop/node_modules/.bin:$PATH"
export PERSONALAGENT_INSTANCE="${PERSONALAGENT_INSTANCE:-test}"
case "${1:-help}" in
 setup)
  node -e 'if(Number(process.versions.node.split(".")[0])<22)throw Error("Node.js 22+ required")'
  cd "$ROOT"; npm ci --cache "$ROOT/../npm-cache"
  cd "$ROOT/desktop"; npm ci --cache "$ROOT/../npm-cache"
  electron_config_cache="$ROOT/../electron-cache" npm run install:electron
  cd "$ROOT"; npm run build
  cd "$ROOT/desktop"; npm run check; npm run build
  ;;
 start) cd "$ROOT/desktop"; npm start ;;
 shell) cd "$ROOT"; exec "${SHELL:-/bin/zsh}" -f ;;
 build) cd "$ROOT"; npm run build; cd "$ROOT/desktop"; npm run check; npm run build ;;
 test) cd "$ROOT"; npm test; cd "$ROOT/desktop"; npm test ;;
 package) cd "$ROOT/desktop"; npm run package:mac ;;
 *) echo 'Usage: scripts/macos-dev.sh setup|start|shell|build|test|package' ;;
esac
