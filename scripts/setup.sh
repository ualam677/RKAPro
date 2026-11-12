#!/usr/bin/env bash
# One-time setup: card database + card scripts (ProjectIgnis, used by EDOPro) and node deps.
set -e
cd "$(dirname "$0")/.."
mkdir -p sim/data
[ -d sim/data/babel ] || git clone --depth 1 https://github.com/ProjectIgnis/BabelCDB sim/data/babel
[ -d sim/data/cardscripts ] || git clone --depth 1 https://github.com/ProjectIgnis/CardScripts sim/data/cardscripts
(cd sim && npm install)
(cd app && npm install)
echo "Ready. Try: node sim/tools/check2.mjs 1 plain"
