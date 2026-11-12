// node tools/update-data.mjs [--check]
// Data update (new-card flow, part 1): pull the newest card database and scripts, report what changed for the deck,
// run the regression gate, and roll back to the previous pin if the gate fails.
//   --check   only report where the data stands (pin, local commits); change nothing.
// The pin (sim/data.lock.json) records the commits the gate last passed on.
import { execFileSync, spawnSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";
import path from "path";

const root = fileURLToPath(new URL("../..", import.meta.url));
const DATA = { babel: path.join(root, "sim/data/babel"), cardscripts: path.join(root, "sim/data/cardscripts") };
const LOCK = path.join(root, "sim/data.lock.json");
const git = (dir, ...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
const head = (dir) => git(dir, "rev-parse", "HEAD");
const pack = JSON.parse(readFileSync(path.join(root, "packs/galaxy-eyes/deck.json"), "utf8"));
const deckNames = new Set([...Object.keys(pack.main), ...Object.keys(pack.replayMain), ...pack.extra]);

/** id -> "name|text|stats" for every card the engine loads, plus the ids of the deck's cards. */
function snapshotCards() {
  const rows = new Map(); const deckIds = new Set();
  for (const f of ["cards.cdb", ...git(DATA.babel, "ls-files", "release-*.cdb").split("\n").filter((x) => x && !/rush/.test(x)).sort()]) {
    const p = path.join(DATA.babel, f); if (!existsSync(p)) continue;
    const db = new DatabaseSync(p);
    for (const r of db.prepare("select d.id,d.alias,d.type,d.level,d.attribute,d.race,d.atk,d.def,t.name,t.desc from datas d join texts t on t.id=d.id").all()) {
      if (rows.has(r.id)) continue;
      rows.set(r.id, [r.name, r.desc, r.type, r.level, r.attribute, r.race, r.atk, r.def].join("|"));
      if (deckNames.has(r.name)) deckIds.add(r.alias || r.id);
    }
    db.close();
  }
  return { rows, deckIds };
}
const nameOfRow = (s) => s.split("|")[0];

const before = { babel: head(DATA.babel), cardscripts: head(DATA.cardscripts) };
const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, "utf8")) : null;
console.log(`pin:   ${lock ? `babel ${lock.babel.slice(0, 8)}, cardscripts ${lock.cardscripts.slice(0, 8)} (gate passed ${lock.date})` : "none yet"}`);
console.log(`local: babel ${before.babel.slice(0, 8)}, cardscripts ${before.cardscripts.slice(0, 8)}`);
if (process.argv.includes("--check")) process.exit(0);

const old = snapshotCards();
for (const dir of Object.values(DATA)) { git(dir, "fetch", "--depth", "1", "origin"); git(dir, "reset", "--hard", "FETCH_HEAD"); }
const after = { babel: head(DATA.babel), cardscripts: head(DATA.cardscripts) };
if (after.babel === before.babel && after.cardscripts === before.cardscripts) console.log("Already up to date.");

// ---- report ----
const now = snapshotCards();
const added = [...now.rows.keys()].filter((id) => !old.rows.has(id));
const changed = [...now.rows.keys()].filter((id) => old.rows.has(id) && old.rows.get(id) !== now.rows.get(id));
const removed = [...old.rows.keys()].filter((id) => !now.rows.has(id));
const scripts = after.cardscripts === before.cardscripts ? [] : git(DATA.cardscripts, "diff", "--name-only", before.cardscripts, after.cardscripts).split("\n").filter(Boolean);
const scriptIds = new Set(scripts.map((f) => Number(/c(\d+)\.lua$/.exec(f)?.[1])).filter(Boolean));
const shared = scripts.filter((f) => !/c\d+\.lua$/.test(f)); // utility.lua, proc_*.lua ... affect every card
console.log(`\nCard database: ${added.length} new, ${changed.length} changed, ${removed.length} removed. Scripts: ${scripts.length} files changed (${shared.length} shared).`);
if (added.length) console.log("New cards: " + added.slice(0, 40).map((id) => nameOfRow(now.rows.get(id))).join(", ") + (added.length > 40 ? ", ..." : ""));
const deckText = changed.filter((id) => now.deckIds.has(id)), deckScript = [...scriptIds].filter((id) => now.deckIds.has(id));
console.log(deckText.length || deckScript.length || shared.length
  ? `DECK CARDS AFFECTED: text/stats: ${deckText.map((id) => nameOfRow(now.rows.get(id))).join(", ") || "none"}; script: ${deckScript.map((id) => nameOfRow(now.rows.get(id) ?? String(id))).join(", ") || "none"}; shared scripts: ${shared.join(", ") || "none"}`
  : "No card in the deck (current list, replay list, Extra Deck) changed.");

// ---- regression gate ----
console.log("\nRunning the regression gate (golden tests, then scripts/verify.sh, about 4 min)...");
const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" }).status === 0;
const ok = run("npm", ["test", "--silent"], path.join(root, "sim")) && run("bash", ["scripts/verify.sh"], root);
if (ok) {
  writeFileSync(LOCK, JSON.stringify({ ...after, date: new Date().toISOString().slice(0, 10) }, null, 2) + "\n");
  console.log(`\nGate passed. Pinned babel ${after.babel.slice(0, 8)}, cardscripts ${after.cardscripts.slice(0, 8)} in sim/data.lock.json (commit that file).`);
} else {
  for (const [k, dir] of Object.entries(DATA)) git(dir, "reset", "--hard", before[k]);
  console.log(`\nGATE FAILED on the new data. Rolled back to babel ${before.babel.slice(0, 8)}, cardscripts ${before.cardscripts.slice(0, 8)}.`);
  console.log("Read the changed scripts of the affected cards above before deciding: EDOPro's scripts are the ruling authority, so a failing replay may now be illegal as recorded.");
  process.exitCode = 1;
}
