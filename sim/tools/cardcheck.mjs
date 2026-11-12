// node tools/cardcheck.mjs <passcode|name fragment>...   Look a card up in EVERY cdb (incl. pre-release, which the engine does
// not load) and say whether a script exists. First half of the data-update check (ROADMAP 1.6).
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "url";
import { readdirSync, existsSync } from "fs";
import path from "path";
const CDB_DIR = process.env.YGO_CDB_DIR ?? fileURLToPath(new URL("../data/babel", import.meta.url));
const SCRIPTS = process.env.YGO_SCRIPTS_DIR ?? fileURLToPath(new URL("../data/cardscripts", import.meta.url));
const dbs = readdirSync(CDB_DIR).filter((f) => f.endsWith(".cdb"));
for (const q of process.argv.slice(2)) {
  const isId = /^\d+$/.test(q); let hits = 0;
  for (const f of dbs) {
    const db = new DatabaseSync(path.join(CDB_DIR, f));
    const rows = db.prepare(`select t.id,t.name,t.desc,d.type,d.atk,d.level,d.alias from texts t join datas d on d.id=t.id where ${isId ? "t.id=? or d.alias=?" : "t.name like ? or t.name like ?"}`)
      .all(...(isId ? [Number(q), Number(q)] : [`%${q}%`, `%${q}%`]));
    for (const r of rows) {
      hits++;
      const script = ["official", "pre-release", "unofficial", "pre-errata"].find((d) => existsSync(path.join(SCRIPTS, d, `c${r.id}.lua`)));
      const loaded = f === "cards.cdb" || (/^release-/.test(f) && !/rush/.test(f));
      console.log(`## ${r.name} [${r.id}${r.alias ? " alias " + r.alias : ""}] ${f}${loaded ? "" : " (NOT loaded by the engine)"} script:${script ?? "MISSING"} type:0x${r.type.toString(16)} lv:${r.level & 255} atk:${r.atk}\n${r.desc}\n`);
    }
    db.close();
  }
  if (!hits) console.log(`## ${q}: NOT FOUND in ${dbs.length} databases (data snapshot too old, or an Omega-only passcode)\n`);
}
