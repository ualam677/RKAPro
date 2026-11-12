#!/usr/bin/env bash
# Compact regression: replays the five user lines exactly, one result line each (about 3-5 min on 2 cores).
# Soldier (route 3) uses Omega's illegal Antimatter ruling on purpose; it is the only way to reproduce that recording.
cd "$(dirname "$0")/../sim" || exit 1
out=$(mktemp -d)
run() { node --no-warnings tools/check2.mjs "$1" plain 2>"$out/$1.err" | tail -1 > "$out/$1.json"; }
run 0 & run 1 & wait
run 2 & YGO_OMEGA_RULINGS=1 run 3 & wait
run 4
node -e '
const fs=require("fs");const dir=process.argv[1];let bad=0;
for (const r of [0,1,2,3,4]) { let j; try { j=JSON.parse(fs.readFileSync(dir+"/"+r+".json","utf8")); } catch { const e=(fs.existsSync(dir+"/"+r+".err")?fs.readFileSync(dir+"/"+r+".err","utf8"):"").trim().split("\n").filter(Boolean); console.log(r,"FAILED to run:",(e.find(l=>/Error/.test(l))||e[0]||"no output")); bad++; continue; }
  const [a,b]=j.followed.split("/").map(Number); const ok=a===b; if(!ok)bad++;
  console.log((ok?"OK  ":"FAIL"),j.route.padEnd(18),"followed",j.followed.padEnd(6),"board",j.board, r===3?"(Omega ruling)":""); }
process.exit(bad?1:0)' "$out"
