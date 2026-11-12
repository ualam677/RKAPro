// Headless EDOPro duels: card data from BabelCDB, scripts from ProjectIgnis/CardScripts.
import Database from "better-sqlite3";
import { readFileSync, existsSync, readdirSync } from "fs";
import path from "path";
import createCore, { OcgDuelMode, OcgLocation, OcgPosition, OcgProcessResult } from "ocgcore-wasm";

export { OcgLocation, OcgPosition, OcgProcessResult };
const CDB_DIR = process.env.YGO_CDB_DIR ?? new URL("./data/babel", import.meta.url).pathname;
const SCRIPTS = process.env.YGO_SCRIPTS_DIR ?? new URL("./data/cardscripts", import.meta.url).pathname;

// ---------- card data ----------
export const cards = new Map();
export const names = new Map();
{
  const files = ["cards.cdb", ...readdirSync(CDB_DIR).filter((f) => /release-.*\.cdb$/.test(f) && !/rush/.test(f)).sort()];
  for (const f of files) {
    const db = new Database(path.join(CDB_DIR, f), { readonly: true });
    db.defaultSafeIntegers(true);
    for (const r of db.prepare("select d.id,d.alias,d.setcode,d.type,d.level,d.attribute,d.race,d.atk,d.def,t.name from datas d join texts t on t.id=d.id").iterate()) {
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
  }
}
export const nameOf = (c) => names.get(c) ?? `#${c}`;

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

export const lib = await createCore({ sync: true });

/**
 * Create a duel. `deck0` / `deck1` are lists of passcodes, TOP CARD FIRST (no shuffling),
 * so the first 5 of deck0 are your opening hand.
 */
export function newDuel({ deck0, extra0 = [], deck1, extra1 = [], hand0 = 5, hand1 = 5, seed = 1n }) {
  const h = lib.createDuel({
    flags: OcgDuelMode.MODE_MR5 | OcgDuelMode.PSEUDO_SHUFFLE,
    seed: [seed, 2n, 3n, 4n],
    team1: { drawCountPerTurn: 1, startingDrawCount: hand0, startingLP: 8000 },
    team2: { drawCountPerTurn: 1, startingDrawCount: hand1, startingLP: 8000 },
    cardReader: (code) => cards.get(code) ?? null,
    scriptReader: (s) => readScript(s),
    errorHandler: (type, text) => { if (!/not found/.test(text)) errors.push(`${type}: ${text}`); },
  });
  if (!h) throw new Error("createDuel failed");
  for (const f of ["constant.lua", "utility.lua"]) lib.loadScript(h, f, readScript(f));
  const add = (team, code, loc) => lib.duelNewCard(h, { team, duelist: 0, code, controller: team, location: loc, sequence: 1, position: OcgPosition.FACEDOWN_DEFENSE });
  // sequence 1 = bottom: adding top-first keeps the given order
  for (const c of deck0) add(0, c, OcgLocation.DECK);
  for (const c of extra0) add(0, c, OcgLocation.EXTRA);
  for (const c of deck1) add(1, c, OcgLocation.DECK);
  for (const c of extra1) add(1, c, OcgLocation.EXTRA);
  lib.startDuel(h);
  return h;
}
export const errors = [];

/** Run until a decision is needed. Returns { prompt, log } where log is every message seen. */
export function runUntilPrompt(h, log = []) {
  for (;;) {
    const st = lib.duelProcess(h);
    const msgs = lib.duelGetMessage(h);
    let prompt = null;
    for (const m of msgs) { log.push(m); if (isPrompt(m)) prompt = m; }
    if (st === OcgProcessResult.END) return { prompt: null, log, ended: true };
    if (st === OcgProcessResult.WAITING && prompt) return { prompt, log };
  }
}
export function isPrompt(m) { return (m.type >= 10 && m.type <= 26 && m.type !== 17) || m.type === 132 || (m.type >= 140 && m.type <= 143); }
