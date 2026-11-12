// Search every line from an opening hand (going first) with the real EDOPro engine.
import { lib, newDuel, runUntilPrompt, nameOf } from "./engine.mjs";
import { choices, T } from "./choices.mjs";
import { save, restore } from "./state.mjs";
import { readSide, stateKey, scoreBoard, describeBoard, HAND_TRAPS } from "./board.mjs";
import { id, extraList } from "./deck.mjs";

const FILLER = Array(40).fill(id("Dark Magician"));
// Extra Deck cards Pot of Prosperity may banish, least useful first.
const PROSPERITY_ORDER = ["Dark Ceruvim Irisfil", "Number S38: Titanic Galaxy", "Galaxy-Eyes Cipher X Dragon", "Galaxy-Eyes Cipher Dragon",
  "Starliege Photon Blast Dragon", "Neo Galaxy-Eyes Photon Dragon - Photon Howling", "Galaxy-Eyes Antimatter Dragon", "Number 104: Masquerade Vain",
  "Galaxy-Eyes Full Armor Photon Dragon", "Number 107: Galaxy-Eyes Tachyon Dragon", "Number 38: Hope Harbinger Dragon Titanic Galaxy"];

/** Choices we never want to explore on our own turn. */
function prune(p, opts) {
  if (p.type === T.CARD && p.selects.length >= 3 && p.selects.every((c) => c.location === 64) && p.min >= 3) {
    // Pot of Prosperity banish: pick the least useful cards instead of branching over hundreds of sets
    const order = (c) => { const i = PROSPERITY_ORDER.indexOf(nameOf(c.code)); return i < 0 ? 99 : i; };
    const ranked = p.selects.map((c, i) => [order(c), i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
    const out = [];
    for (const k of [p.max, p.min]) if (k >= p.min && k <= p.max) out.push({ label: `Banish ${k} from Extra`, res: { type: 5, indicies: ranked.slice(0, k) } });
    return out;
  }
  return opts.filter((o) => !(o.code && HAND_TRAPS.has(nameOf(o.code)) && /^(Activate|Chain|Yes)/.test(o.label)));
}

/**
 * @param hand    opening hand (codes)
 * @param deck    rest of the Main Deck, top first
 * @param budget  max decisions explored
 */
export function solve(hand, deck, { budget = 4000, extra = extraList(), handSize = hand.length, onBoard } = {}) {
  const h = newDuel({ deck0: [...hand, ...deck], extra0: extra, deck1: FILLER, hand0: handSize });
  let nodes = 0;
  const seen = new Set();
  let best = { value: -1 };
  const path = [];
  let idleActs = new Set(); // quick effects already offered at the last open game state

  /** Drive until a real decision for us; auto-answer the opponent and forced/single choices. */
  function advance(log) {
    for (;;) {
      const r = runUntilPrompt(h, log);
      if (r.ended) return { ended: true };
      const p = r.prompt;
      if (log.some((m) => m.type === 40 && m.player === 1)) return { endedTurn: true };
      if (p.player !== 0) { lib.duelSetResponse(h, choices(p)[0].res); continue; } // opponent: always pass / default
      let opts = prune(p, choices(p));
      if (p.type === T.CHAIN && !p.forced) {
        // A quick effect we could equally use at the next open game state is not worth branching on here.
        const fresh = opts.filter((o) => o.pass || !idleActs.has(`${o.code}`));
        if (fresh.length) opts = fresh;
      }
      if (opts.length === 0) { lib.duelSetResponse(h, choices(p)[0].res); continue; }
      if (opts.length === 1) { path.push(opts[0].label); lib.duelSetResponse(h, opts[0].res); continue; }
      return { p, opts };
    }
  }

  function finishTurn() {
    // we chose to end: pass everything until the opponent's turn starts
    const log = [];
    for (let guard = 0; guard < 200; guard++) {
      const r = runUntilPrompt(h, log);
      if (r.ended || log.some((m) => m.type === 40 && m.player === 1)) break;
      const p = r.prompt;
      const c = choices(p);
      lib.duelSetResponse(h, (c.find((x) => x.pass || x.end) ?? c[0]).res);
    }
    const s = readSide(h, 0);
    const sc = scoreBoard(s);
    const total = sc.value + 0.01 * sc.follow;
    if (total > best.value) best = { value: total, score: sc, board: describeBoard(s), line: path.slice() };
    onBoard?.(sc);
  }

  function dfs() {
    const log = [];
    const a = advance(log);
    if (a.ended) return;
    if (a.endedTurn) { finishTurn(); return; }
    const { p, opts } = a;
    if (p.type === T.IDLE) {
      idleActs = new Set(p.activates.map((c) => `${c.code}`));
      const key = stateKey(readSide(h, 0)) + "|" + path.filter((x) => /^(Activate|Chain|Yes|Normal|Special)/.test(x)).sort().join(";");
      if (seen.has(key)) return;
      seen.add(key);
    }
    // try summons/activations before ending, ending last
    const ordered = [...opts.filter((o) => !o.end && !o.pass), ...opts.filter((o) => o.pass), ...opts.filter((o) => o.end)];
    const snap = save();
    const depth = path.length;
    for (let i = 0; i < ordered.length; i++) {
      if (nodes >= budget) break;
      if (i > 0) restore(snap);
      path.length = depth;
      const o = ordered[i];
      nodes++;
      path.push(o.label);
      lib.duelSetResponse(h, o.res);
      if (o.end) finishTurn(); else dfs();
    }
  }

  dfs();
  lib.destroyDuel(h);
  return { ...best, nodes, exhausted: nodes < budget };
}
