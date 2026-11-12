// Exact replay follower: drive the engine along the user's recorded line by matching engine messages
// (moves, summons, activations) against the replay's own message stream.
import { lib, newDuel, runUntilPrompt, nameOf } from "../engine.mjs";
import { choices, T, setZoneBranching } from "../choices.mjs";
import { save, restore } from "../state.mjs";
import { readSide, scoreBoard, describeBoard, stateKey } from "../board.mjs";

const ZONE = (loc) => (loc & 0x80 ? "Material" : ({ 1: "Deck", 2: "Hand", 4: "Field", 8: "S/T", 16: "GY", 32: "Banished", 64: "Extra" })[loc & 0x7f] ?? "?");
// ocgcore-wasm marks Xyz materials with overlay_sequence (location is then the parent's location)
const Z = (l) => (l.overlay_sequence !== undefined ? "Material" : ZONE(l.location));
/** Engine messages -> the same event shape as the replay parser (player 0 only). */
export function events(log) {
  const out = [];
  for (const m of log) {
    if (m.type === 50 && m.to?.controller === 0 && m.card) out.push({ kind: "move", name: nameOf(m.card), from: Z(m.from), to: Z(m.to) });
    else if ((m.type === 60 || m.type === 62) && m.controller === 0) out.push({ kind: "summon", name: nameOf(m.code) });
    else if (m.type === 70 && m.controller === 0) out.push({ kind: "activate", name: nameOf(m.code), from: ZONE(m.location) });
  }
  return out;
}
const same = (a, b) => a.kind === b.kind && a.name === b.name && (a.kind !== "move" || (a.from === b.from && a.to === b.to)) && (a.kind !== "activate" || a.from === b.from);

/** Greedy in-order match of engine events against expected events from position ptr. Returns [newPtr, strays]. */
const isNoise = (e) => e.kind === "move" && e.from === "Material" && e.to === "Material";
function advanceMatch(expected, ptr, got) {
  let strays = 0, matched = 0, skipped = 0;
  for (const e of got) {
    let k = -1, sk = 0;
    if (isNoise(e)) { // a material transfer only counts if it's (almost) next
      for (let j = ptr; j < Math.min(expected.length, ptr + 2); j++) if (same(e, expected[j])) { k = j; break; }
    } else {
      let steps = 0;
      for (let j = ptr; j < Math.min(expected.length, ptr + 25) && steps < 6; j++) {
        if (same(e, expected[j])) { k = j; break; }
        if (!isNoise(expected[j])) { steps++; sk++; } // skipped transfers don't use up the window
      }
    }
    if (k >= 0) { ptr = k + 1; matched++; skipped += sk; } else if (e.kind !== "move") strays++;
  }
  return [ptr, strays, matched, skipped];
}
const STRICT = process.env.LOOSE ? false : true; // summons/activations not in the replay are heavily penalised
const noise = (e) => e.kind === "move" && e.from === "Material" && e.to === "Material"; // material transfers: no decision involved
export function followReplay({ hand, deck, extra, deck1, expected: rawExpected, interrupt, stopWhenFired = false, maxSteps = 400, B = 12 }) {
  const expected = rawExpected;
  setZoneBranching(true);
  const total = expected.filter((e) => !isNoise(e)).length;
  const progress = (p) => expected.slice(0, p).filter((e) => !isNoise(e)).length;
  const h = newDuel({ deck0: [...hand, ...deck], extra0: extra, deck1, hand0: hand.length });
  const getI = () => (interrupt?.state ? JSON.stringify(interrupt.state) : null);
  const setI = (x) => { if (x) { for (const k of Object.keys(interrupt.state)) delete interrupt.state[k]; Object.assign(interrupt.state, JSON.parse(x)); } };
  const oppPick = (p, log = []) => { const c = choices(p); return (interrupt?.(p, c, log) ?? c.find((x) => x.pass) ?? c[0]).res; };
  const step = (log, rec) => {
    for (;;) {
      const r = runUntilPrompt(h, log);
      if (r.ended) return { ended: true };
      if (log.some((m) => m.type === 40 && m.player === 1)) return { endedTurn: true };
      if (r.prompt.player !== 0) { lib.duelSetResponse(h, oppPick(r.prompt, log)); continue; }
      const c = choices(r.prompt);
      if (c.length === 1) { lib.duelSetResponse(h, c[0].res); rec.push(c[0].res); continue; }
      return { prompt: r.prompt, opts: c };
    }
  };
  const LOCS = { deck: "Deck", gy: "GY", extra: "Extra", field: "Field", hand: "Hand", banished: "Banished", "s/t": "S/T" };
  const namesOf = (o) => {
    const parts = o.label.replace(/^(Pick|Select|Normal Summon|Special Summon|Activate|Chain|Set|Yes:)\s*/, "").split(" + ");
    const codes = o.picks ?? (o.code ? [o.code] : []);
    return codes.map((c, i) => { const m = (parts[i] ?? "").match(/\(([^)]+)\)\s*$/); return [nameOf(c), m ? LOCS[m[1].toLowerCase()] ?? null : (/^(Pick|Select)/.test(o.label) ? "Hand" : null)]; });
  };
  const isAction = (o) => /^(Normal Summon|Special Summon|Activate|Chain|Set|Yes)/.test(o.label);
  const first = []; const cur0 = step([], first);
  let beam = [{ snap: save(), i: getI(), ptr: 0, score: 0, responses: first, cur: cur0, done: !cur0.prompt }];
  let firedAt = null;
  for (let n = 0; n < maxSteps; n++) {
    if (beam.every((b) => b.done)) break;
    const cands = [];
    for (const b of beam) {
      if (b.done) { cands.push({ ...b, carry: true }); continue; }
      for (const o of b.cur.opts) {
        restore(b.snap); setI(b.i);
        const log = [], rec = []; lib.duelSetResponse(h, o.res); const nx = step(log, rec);
        const got = events(log);
        const [np, strays, matched, skipped] = advanceMatch(expected, b.ptr, got);
        const strayMoves = Math.max(0, got.filter((e) => e.kind === "move").length - matched);
        const left = progress(np) < total;
        // tie-break for choices whose effect shows up later (multi-card selections): cards that appear soon in the replay
        const upcoming = expected.slice(b.ptr, b.ptr + 12);
        let hint = 0;
        for (const [x, loc] of namesOf(o)) { const i = upcoming.findIndex((e) => e.name === x && (!loc || !e.from || e.from === loc)); if (i >= 0) hint += 2 - i * 0.1; else if (isAction(o)) hint -= 1; }
        const straySummons = got.filter((e) => e.kind === "summon").length - Math.min(matched, got.filter((e) => e.kind === "summon").length);
        const sc = b.score + matched * 10 - skipped * 12 - strays * 3 - (STRICT ? (Math.max(0, straySummons) + strays) * 40 : 0) - strayMoves * 0.5 - (o.end && left ? 200 : 0) + hint;
        const fired = !!interrupt?.state?.fired;
        const key = `${np}|${stateKey(readSide(h, 0))}|${nx.prompt ? nx.prompt.type + ':' + nx.opts.map((x) => x.label).join(',') : 'end'}`;
        if (process.env.DEBUG4 && b === beam[0] && b.ptr >= +process.env.DEBUG4.split("-")[0] && b.ptr <= +process.env.DEBUG4.split("-")[1]) console.error(`ptr ${b.ptr} | ${o.label} -> [${got.map((e) => `${e.kind[0]}:${e.name.slice(0, 18)}${e.from ? ' ' + e.from + '>' + (e.to ?? '') : ''}`).join(', ')}] m${matched} s${skipped} x${strays} sc${(sc - b.score).toFixed(1)}`);
        if (process.env.DEBUG2 && !nx.prompt && np >= 20) console.error('ENDS', b.ptr, np, o.label, JSON.stringify(nx), 'last msgs', log.slice(-4).map((m) => m.type).join(','));
        cands.push({ parent: b, o, rec, np, sc, nx, fired, key, done: !nx.prompt || !left || (stopWhenFired && fired) });
      }
    }
    cands.sort((x, y) => y.sc - x.sc);
    const seen = new Set(); const next = [];
    for (const c of cands) {
      if (c.carry) { next.push(c); if (next.length >= B) break; continue; }
      if (seen.has(c.key)) continue; seen.add(c.key);
      // re-materialise this candidate
      restore(c.parent.snap); setI(c.parent.i);
      const rec = []; lib.duelSetResponse(h, c.o.res); const nx = step([], rec);
      next.push({ snap: save(), i: getI(), ptr: c.np, score: c.sc, responses: [...c.parent.responses, c.o.res, ...rec], cur: nx, done: c.done, fired: c.fired });
      if (next.length >= B) break;
    }
    if (process.env.DEBUG3 && next.some((b) => b.ptr >= 20)) console.error('step', n, next.map((b) => `${b.ptr}:${b.score.toFixed(0)}${b.done ? 'D' : ''}:${b.cur?.prompt ? b.cur.opts.length : 'x'}`).join(' '));
    beam = next;
  }
  const best = beam.sort((x, y) => y.score - x.score)[0];
  if (process.env.DEBUG) { console.error("STUCK at", best.ptr, "next:", expected.slice(best.ptr, best.ptr + 6).map((e) => `${e.kind[0]}:${e.name}${e.from ? ` ${e.from}>${e.to ?? ''}` : ''}`).join(" | ")); console.error("opts:", best.cur.opts?.map((o) => o.label).join(" / ")); console.error("beam:", beam.map((b) => `${b.ptr}:${b.score.toFixed(0)}${b.done ? 'D' : ''}`).join(" ")); }
  restore(best.snap); setI(best.i);
  if (stopWhenFired && best.fired) firedAt = best.responses.length;
  let cur = best.cur;
  if (cur.prompt && firedAt === null) { // finish the turn: set the backrow, pass everything else
    for (let g = 0; g < 300 && cur.prompt; g++) {
      const c = cur.opts;
      const pick = c.find((x) => /^Set (Eternal Galaxy|Tachyon Transmigration)/.test(x.label)) ?? c.find((x) => x.pass || x.end) ?? c.find((x) => /^No/.test(x.label)) ?? c[0];
      lib.duelSetResponse(h, pick.res); cur = step([], []);
    }
  }
  const side = readSide(h, 0);
  lib.destroyDuel(h);
  setZoneBranching(false);
  return { responses: best.responses, matched: progress(best.ptr), total, firedAt, score: scoreBoard(side), board: describeBoard(side) };
}
