// Beam search over open game states (your idle prompts) with the real EDOPro engine.
import { lib, newDuel, runUntilPrompt, nameOf, cards } from "./engine.mjs";
import { choices, T } from "./choices.mjs";
import { save, restore } from "./state.mjs";
import { readSide, stateKey, scoreBoard, describeBoard, HAND_TRAPS } from "./board.mjs";
import { id, extraList } from "./deck.mjs";

const FILLER = Array(40).fill(id("Dark Magician"));
const PROSPERITY_ORDER = ["Dark Ceruvim Irisfil", "Number S38: Titanic Galaxy", "Galaxy-Eyes Cipher X Dragon", "Galaxy-Eyes Cipher Dragon",
  "Starliege Photon Blast Dragon", "Neo Galaxy-Eyes Photon Dragon - Photon Howling", "Galaxy-Eyes Antimatter Dragon", "Number 104: Masquerade Vain",
  "Galaxy-Eyes Full Armor Photon Dragon", "Number 107: Galaxy-Eyes Tachyon Dragon", "Number 38: Hope Harbinger Dragon Titanic Galaxy"];

function prune(p, opts) {
  if (p.type === T.CARD && p.selects.length >= 3 && p.selects.every((c) => c.location === 64) && p.min >= 3) {
    const order = (c) => { const i = PROSPERITY_ORDER.indexOf(nameOf(c.code)); return i < 0 ? 99 : i; };
    const ranked = p.selects.map((c, i) => [order(c), i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
    return [p.max, p.min].filter((k, i, a) => a.indexOf(k) === i).map((k) => ({ label: `Banish ${k} from Extra`, res: { type: 5, indicies: ranked.slice(0, k) } }));
  }
  return opts.filter((o) => !(o.code && HAND_TRAPS.has(nameOf(o.code)) && /^(Activate|Chain|Yes)/.test(o.label)));
}

/** Card names mentioned by action labels, in order (for matching against a replay line). */
export function tokens(labels) {
  const out = [];
  for (const l of labels) {
    let m = l.match(/^(?:Normal Summon|Special Summon|Activate|Chain|Yes:|Set) (.+?)(?: \((?:GY|Field|Extra|Deck|S\/T|Banished|Hand)\))?$/);
    if (m) { out.push(m[1].trim()); continue; }
    m = l.match(/^(?:Pick|Select) (.+)$/);
    if (m) for (const n of m[1].split(" + ")) out.push(n.replace(/\((?:GY|Field|Extra|Deck|S\/T|Banished|Hand)\)$/, "").trim());
  }
  return out;
}
export function lcs(a, b) {
  let prev = new Uint16Array(b.length + 1), cur = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

const isEngineCard = (c) => !HAND_TRAPS.has(nameOf(c));

/** Heuristic promise of an unfinished state: what it's worth now + resources still to spend. */
function promise(side, idlePrompt) {
  const sc = scoreBoard(side);
  const mons = side.monsters.filter((m) => m.pos & 5);
  const mats = side.monsters.reduce((a, m) => a + m.mats.length, 0);
  const engineHand = side.hand.filter(isEngineCard).length;
  const ns = idlePrompt?.summons?.length ? 1 : 0;
  const keyInHand = side.hand.filter((c) => ["Eternal Galaxy", "Tachyon Transmigration", "Galaxy-Eyes Tachyon Primal"].includes(nameOf(c))).length;
  const keySet = side.st.filter((x) => ["Eternal Galaxy", "Tachyon Transmigration"].includes(nameOf(x.code))).length;
  return sc.value * 3 + sc.handTraps * 2.4 + keyInHand * 0.6 + keySet * 0.8 + mons.length * 0.5 + mats * 0.45 + engineHand * 0.5 + ns * 0.6 + side.grave.length * 0.05;
}

export function beamSolve(hand, deck, { width = 40, innerCap = 60, maxLayers = 40, extra = extraList(), timeLimitMs = 120000, interrupt, guide, stopAt = Infinity, deck1 = FILLER, prefix } = {}) {
  const t0 = performance.now();
  const S = () => ({ m: save(), i: interrupt?.state ? JSON.stringify(interrupt.state) : null });
  const R = (x) => { restore(x.m); if (x.i) { for (const k of Object.keys(interrupt.state)) delete interrupt.state[k]; Object.assign(interrupt.state, JSON.parse(x.i)); } };
  const h = newDuel({ deck0: [...hand, ...deck], extra0: extra, deck1, hand0: hand.length });
  let best = { value: -1 };
  const seen = new Set();
  let nodes = 0;
  let idleActs = new Set();

  /** Drive to the next multi-choice prompt of ours. `choose` is called at every multi-option prompt (replay or explore). */
  function advance(log) {
    for (;;) {
      const r = runUntilPrompt(h, log);
      if (r.ended) return { ended: true };
      if (log.some((m) => m.type === 40 && m.player === 1)) return { endedTurn: true };
      const p = r.prompt;
      if (p.player !== 0) {
        const c = choices(p);
        const pick = interrupt?.(p, c, log) ?? (c.find((x) => x.pass) ?? c[0]);
        lib.duelSetResponse(h, pick.res); continue;
      }
      let opts = prune(p, choices(p));
      if (p.type === T.CHAIN && !p.forced) {
        const fresh = opts.filter((o) => o.pass || !idleActs.has(`${o.code}`));
        if (fresh.length) opts = fresh;
      }
      if (opts.length <= 1) { lib.duelSetResponse(h, (opts[0] ?? choices(p)[0]).res); continue; }
      return { p, opts };
    }
  }

  function finishTurn(path, resps) {
    const log = [];
    for (let g = 0; g < 300; g++) {
      const r = runUntilPrompt(h, log);
      if (r.ended || log.some((m) => m.type === 40 && m.player === 1)) break;
      const c = choices(r.prompt);
      const pick = r.prompt.player !== 0 ? (interrupt?.(r.prompt, c, log) ?? c.find((x) => x.pass) ?? c[0]) : (c.find((x) => x.pass || x.end) ?? c[0]);
      lib.duelSetResponse(h, pick.res);
    }
    const s = readSide(h, 0);
    const sc = scoreBoard(s);
    // objective: board interruptions + hand traps you still hold (each worth a bit less than a board negate)
    const v = sc.value + 0.8 * sc.handTraps + 0.01 * s.hand.length;
    if (v > best.value) best = { value: v, score: sc, board: describeBoard(s), line: path.slice(), resps: resps.slice(), istate: interrupt?.state ? { ...interrupt.state } : null };
  }

  // initial state
  let a;
  if (prefix) { // replay a known opening (every one of our responses), then search from the next idle
    let i = 0;
    for (let g = 0; g < 5000; g++) {
      const r = runUntilPrompt(h, []);
      if (r.ended) { lib.destroyDuel(h); return { value: 0 }; }
      const p = r.prompt;
      if (p.player !== 0) { const c = choices(p); lib.duelSetResponse(h, (interrupt?.(p, c, []) ?? c.find((x) => x.pass) ?? c[0]).res); continue; }
      if (i < prefix.length) { lib.duelSetResponse(h, prefix[i++]); continue; }
      if (p.type === T.IDLE) { a = { p, opts: prune(p, choices(p)) }; break; }
      const c = choices(p); // between the prefix and the next idle: take optional triggers, don't chain
      lib.duelSetResponse(h, (c.find((x) => /^Yes/.test(x.label)) ?? c.find((x) => x.pass) ?? c[0]).res);
    }
  } else a = advance([]);
  if (!a?.p || a.p.type !== T.IDLE) { lib.destroyDuel(h); return { value: 0 }; }
  let layer = [{ snap: S(), p: a.p, opts: a.opts, path: [], resps: [] }];

  for (let depth = 0; depth < maxLayers && layer.length; depth++) {
    const children = [];
    for (const st of layer) {
      if (performance.now() - t0 > timeLimitMs) break;
      // explore every option from this idle, through inner prompts, to the next idle
      for (let oi = 0; oi < st.opts.length; oi++) {
        R(st.snap);
        idleActs = new Set(st.p.activates.map((c) => `${c.code}`));
        const o = st.opts[oi];
        nodes++;
        lib.duelSetResponse(h, o.res);
        if (o.end) { finishTurn([...st.path, o.label], [...st.resps, o.res]); continue; }
        let leaves = 0;
        const inner = (responses, labels) => {
          if (leaves >= innerCap) return;
          const r = advance([]);
          if (r.ended) return;
          if (r.endedTurn) { leaves++; finishTurn([...st.path, ...labels], [...st.resps, ...responses]); return; }
          if (r.p.type === T.IDLE) {
            leaves++;
            const side = readSide(h, 0);
            const key = stateKey(side) + "|" + labels.filter((x) => /^(Activate|Chain|Yes|Normal|Special)/.test(x)).join(";") + "|" + st.path.filter((x) => /^(Activate|Normal)/.test(x)).sort().join(";");
            const vkey = stateKey(side) + "|" + [...st.path, ...labels].filter((x) => /^(Activate|Chain|Yes|Normal)/.test(x)).sort().join(";");
            if (seen.has(vkey)) return;
            seen.add(vkey);
            let score = promise(side, r.p);
            if (guide) score += 20 * lcs(tokens([...st.path, ...labels]), guide); // follow a known line (longest common subsequence)
            // diversity bucket: what's on the field (ignoring materials) + normal summon used
            const bucket = side.monsters.map((m) => m.code).sort().join(".") + "|" + side.hand.filter(isEngineCard).sort().join(".") + "|" + (r.p.summons?.length ? 1 : 0);
            children.push({ parent: st, responses, labels, score, bucket });
            return;
          }
          const snap = S();
          for (let k = 0; k < r.opts.length && leaves < innerCap; k++) {
            if (k > 0) R(snap);
            nodes++;
            lib.duelSetResponse(h, r.opts[k].res);
            inner([...responses, r.opts[k].res], [...labels, r.opts[k].label]);
          }
        };
        inner([o.res], [o.label]);
      }
    }
    // keep the most promising states
    children.sort((x, y) => y.score - x.score);
    // at most 3 states per bucket, so one family of lines can't fill the beam
    const perBucket = new Map(); const picked = [];
    for (const c of children) {
      const n = perBucket.get(c.bucket) ?? 0;
      if (n >= 4) continue;
      perBucket.set(c.bucket, n + 1); picked.push(c);
      if (picked.length >= width) break;
    }
    const next = [];
    for (const c of picked) {
      R(c.parent.snap);
      idleActs = new Set(c.parent.p.activates.map((x) => `${x.code}`));
      // replay this child's choices exactly
      let r;
      for (const res of c.responses) { lib.duelSetResponse(h, res); r = advance([]); }
      if (!r?.p || r.p.type !== T.IDLE) continue;
      next.push({ snap: S(), p: r.p, opts: r.opts, path: [...c.parent.path, ...c.labels], resps: [...c.parent.resps, ...c.responses] });
    }
    layer = next;
    if (performance.now() - t0 > timeLimitMs || best.score?.value >= stopAt) break;
  }
  lib.destroyDuel(h);
  return { ...best, nodes, ms: performance.now() - t0 };
}

/** Replay a line (the responses a search returned) and return every engine message, for analysis. */
export function replayLine(hand, deck, resps, { extra = extraList(), interrupt, deck1 = FILLER } = {}) {
  const h = newDuel({ deck0: [...hand, ...deck], extra0: extra, deck1, hand0: hand.length });
  const log = [];
  let idle = new Set(), i = 0;
  for (let g = 0; g < 2000; g++) {
    const r = runUntilPrompt(h, log);
    if (r.ended || log.some((m) => m.type === 40 && m.player === 1)) break;
    const p = r.prompt;
    if (p.player !== 0) { const c = choices(p); lib.duelSetResponse(h, (interrupt?.(p, c, log) ?? c.find((x) => x.pass) ?? c[0]).res); continue; }
    let opts = prune(p, choices(p));
    if (p.type === T.CHAIN && !p.forced) { const f = opts.filter((o) => o.pass || !idle.has(`${o.code}`)); if (f.length) opts = f; }
    if (opts.length <= 1 || i >= resps.length) {
      const c = choices(p);
      lib.duelSetResponse(h, (opts.length === 1 ? opts[0] : (c.find((x) => x.pass || x.end) ?? c[0])).res); continue;
    }
    if (p.type === T.IDLE) idle = new Set(p.activates.map((c) => `${c.code}`));
    lib.duelSetResponse(h, resps[i++]);
  }
  const side = readSide(h, 0);
  lib.destroyDuel(h);
  return { log, side };
}
