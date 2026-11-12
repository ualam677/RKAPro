// Node host for packages/engine: loads card data (BabelCDB) and scripts (ProjectIgnis/CardScripts) from disk and injects them.
// node:sqlite is built into Node >= 22.13: no native module to compile (works on Windows without build tools).
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "url";
import { readFileSync, existsSync, readdirSync } from "fs";
import path from "path";
import * as ocg from "ocgcore-wasm";
import { initEngine } from "../packages/engine/core.mjs";

const CDB_DIR = process.env.YGO_CDB_DIR ?? fileURLToPath(new URL("./data/babel", import.meta.url));
const SCRIPTS = process.env.YGO_SCRIPTS_DIR ?? fileURLToPath(new URL("./data/cardscripts", import.meta.url));

// ---------- card data ----------
const cards = new Map();
const names = new Map();
{
  const files = ["cards.cdb", ...readdirSync(CDB_DIR).filter((f) => /release-.*\.cdb$/.test(f) && !/rush/.test(f)).sort()];
  for (const f of files) {
    const db = new DatabaseSync(path.join(CDB_DIR, f));
    const st = db.prepare("select d.id,d.alias,d.setcode,d.type,d.level,d.attribute,d.race,d.atk,d.def,t.name from datas d join texts t on t.id=d.id");
    st.setReadBigInts(true);
    for (const r of st.all()) {
      const id = Number(r.id);
      if (cards.has(id)) continue;
      const set = BigInt(r.setcode), setcodes = [];
      for (let i = 0n; i < 4n; i++) { const s = Number((set >> (16n * i)) & 0xffffn); if (s) setcodes.push(s); }
      const lv = Number(r.level), type = Number(r.type), def = Number(r.def);
      const isLink = (type & 0x4000000) !== 0;
      cards.set(id, {
        code: id, alias: Number(r.alias), setcodes, type, level: lv & 0xff, attribute: Number(r.attribute), race: BigInt(r.race),
        attack: Number(r.atk), defense: isLink ? 0 : def, lscale: (lv >> 24) & 0xff, rscale: (lv >> 16) & 0xff, link_marker: isLink ? def : 0,
      });
      names.set(id, r.name);
    }
    db.close();
  }
}

const scriptCache = new Map();
function readScript(script) {
  if (scriptCache.has(script)) return scriptCache.get(script);
  const name = path.basename(script);
  const cands = /^c\d+\.lua$/.test(name)
    ? ["official", "pre-release", "unofficial", "pre-errata"].map((d) => path.join(SCRIPTS, d, name))
    : [path.join(SCRIPTS, name)];
  const p = cands.find((x) => existsSync(x));
  let src = p ? readFileSync(p, "utf-8") : null;
  // EDOPro's ruling is correct (user, 10 Nov): Galaxy-Eyes Antimatter Dragon's detach effect needs a possible Battle
  // Phase, so not on turn 1. YGO Omega wrongly allows it; YGO_OMEGA_RULINGS=1 copies Omega (only to replay Omega lines).
  if (src && process.env.YGO_OMEGA_RULINGS && name === "c92517928.lua")
    src = src.replace("e2:SetCondition(function() return Duel.IsAbleToEnterBP() end)", "");
  scriptCache.set(script, src);
  return src;
}

initEngine({ ocg, core: await ocg.default({ sync: true }), cards, names, readScript });
export * from "../packages/engine/core.mjs";
