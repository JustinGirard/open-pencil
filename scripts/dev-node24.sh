#!/usr/bin/env bash
set -euo pipefail

NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  if command -v node >/dev/null 2>&1 && [[ "$(node --version)" == v24.* ]]; then
    exec bun run dev
  fi
  echo "Node 24 is required; install nvm and run: nvm install 24"
  exit 1
fi

# shellcheck disable=SC1090
. "$NVM_DIR/nvm.sh"

if ! nvm ls 24 >/dev/null 2>&1; then
  echo "Node 24 is not installed. Run: nvm install 24"
  exit 1
fi

nvm exec 24 bun run dev
