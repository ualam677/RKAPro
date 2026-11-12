#!/usr/bin/env bash
# One-time setup: card database + card scripts (ProjectIgnis, used by EDOPro) and node deps.
set -e
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22||(a===22&&b<13)){console.error("Node >= 22.13 needed (found "+process.versions.node+"). Install the current Node 22 LTS.");process.exit(1)}'
cd "$(dirname "$0")/.."
mkdir -p sim/data
[ -d sim/data/babel ] || git clone --depth 1 https://github.com/ProjectIgnis/BabelCDB sim/data/babel
[ -d sim/data/cardscripts ] || git clone --depth 1 https://github.com/ProjectIgnis/CardScripts sim/data/cardscripts
# Use the pinned data (the commits the regression gate last passed on), if a pin exists. Update with: node sim/tools/update-data.mjs
if [ -f sim/data.lock.json ]; then
  for d in babel cardscripts; do
    sha=$(node -e 'console.log(require("./sim/data.lock.json")[process.argv[1]])' "$d")
    [ "$(git -C "sim/data/$d" rev-parse HEAD)" = "$sha" ] || { git -C "sim/data/$d" fetch --depth 1 origin "$sha" && git -C "sim/data/$d" reset --hard FETCH_HEAD; }
  done
fi
[ -d sim/data/edopro-src ] || git clone --depth 1 https://github.com/edo9300/edopro sim/data/edopro-src  # reference source for the duel client (read, port; never built here)
(cd sim && npm install)
(cd app && npm install && { [ -f node_modules/electron/dist/electron.exe ] || [ -d node_modules/electron/dist ] || node node_modules/electron/install.js; })  # npm may block install scripts: fetch Electron's binary explicitly
echo "Ready. Try: node sim/tools/check2.mjs 1 plain"
