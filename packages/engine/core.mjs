// Engine core: the only code that talks to ocgcore. NO imports on purpose (ROADMAP constraint): the host injects the
// ocgcore-wasm module, card data and a script reader, so the same file runs in Node, Electron, a worker or a phone.
// One engine per process (ocgcore-wasm is one wasm heap); the live bindings below are set by initEngine().
export let lib, cards, names, OcgDuelMode, OcgLocation, OcgPosition, OcgProcessResult;
let readScript;
export const errors = [];
export const nameOf = (c) => names.get(c) ?? `#${c}`;

/** ocg: the ocgcore-wasm module namespace; core: `await ocg.default({ sync: true })`; cards/names: Map by passcode; readScript(name) -> Lua source or null. */
export function initEngine({ ocg, core, cards: c, names: n, readScript: r }) {
  ({ OcgDuelMode, OcgLocation, OcgPosition, OcgProcessResult } = ocg);
  lib = core; cards = c; names = n; readScript = r;
}

/**
 * Create a duel. `deck0` / `deck1` are lists of passcodes, TOP CARD FIRST (no shuffling),
 * so the first 5 of deck0 are your opening hand.
 */
export function newDuel({ deck0, extra0 = [], deck1, extra1 = [], hand0 = 5, hand1 = 5, seed = 1n }) {
  const h = lib.createDuel({
    flags: OcgDuelMode.MODE_MR5 | OcgDuelMode.PSEUDO_SHUFFLE,
    seed: [BigInt(seed), 2n, 3n, 4n],
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
