#!/usr/bin/env bash
# One-command setup: checks Node, installs dependencies and the Chromium browser.
set -euo pipefail

cd "$(dirname "$0")/.."

required_major="$(cat .nvmrc)"

node_major() {
  node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0
}

if [ "$(node_major)" -lt "$required_major" ]; then
  if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    echo "Node $(node --version 2>/dev/null || echo 'not found') is too old; switching with nvm..."
    # shellcheck disable=SC1091
    . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
    nvm install >/dev/null
    nvm use >/dev/null
  fi
fi

if [ "$(node_major)" -lt "$required_major" ]; then
  echo "Error: Node ${required_major}+ is required (found $(node --version 2>/dev/null || echo 'none'))." >&2
  echo "Install it (for example: nvm install ${required_major}) and run this script again." >&2
  exit 1
fi

echo "Using Node $(node --version)"
npm ci

if [ "$(uname -s)" = "Linux" ] && [ -n "${CI:-}" ]; then
  npx playwright install --with-deps chromium
else
  npx playwright install chromium
fi

cat <<'EOF'

Setup complete.
  npm test           run the browser tests
  npm run verify     typecheck + unit tests + browser tests
  npm run report     open the last HTML report
If your shell's default Node is older than 20, run "nvm use" first.
EOF
