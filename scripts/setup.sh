#!/usr/bin/env bash
# One-time setup: card database + card scripts (ProjectIgnis, used by EDOPro) and node deps.
set -e
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22||(a===22&&b<13)){console.error("Node >= 22.13 needed (found "+process.versions.node+"). Install the current Node 22 LTS.");process.exit(1)}'
cd "$(dirname "$0")/.."
mkdir -p sim/data
[ -d sim/data/babel ] || git clone --depth 1 https://github.com/ProjectIgnis/BabelCDB sim/data/babel
[ -d sim/data/cardscripts ] || git clone --depth 1 https://github.com/ProjectIgnis/CardScripts sim/data/cardscripts
(cd sim && npm install)
(cd app && npm install)
echo "Ready. Try: node sim/tools/check2.mjs 1 plain"
