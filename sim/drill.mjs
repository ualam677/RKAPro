// Drill mode and the knowledge base on disk (Node side). A drill = a random hand you play; the grade compares what you
// built with the stored line for that hand class, on several numbers. Corrections are written to the pack as JSON.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { nameOf } from "./engine.mjs";
import { readSide, describeBoard, scoreBoard, HAND_TRAPS } from "./board.mjs";
import { nibiruProof } from "../packs/galaxy-eyes/drill.mjs";
import { evalHand, metrics } from "../packages/analysis/odds.ts";
import { replay } from "../packages/engine/api.mjs";
import { steps } from "../packages/engine/client.mjs";

const PACK = fileURLToPath(new URL("../packs/galaxy-eyes", import.meta.url));
const json = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);
const model = json(path.join(PACK, "lines.json"));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** kb = the knowledge folder (default: the pack's). Tests pass a temp folder. */
export function knowledge(dir = path.join(PACK, "knowledge")) {
  const linesDir = path.join(dir, "lines"), casesDir = path.join(dir, "cases");
  const lines = () => (existsSync(linesDir) ? readdirSync(linesDir).filter((f) => f.endsWith(".json")).map((f) => json(path.join(linesDir, f))) : []);
  return {
    dir, lines,
    /** The line a drill expects for a hand class: the newest line you promoted, else the legal replay line. */
    storedLine(cls) {
      const all = lines().filter((l) => l.class === cls && l.legal !== false);
      return all.filter((l) => l.source === "user").sort((a, b) => b.created - a.created)[0] ?? all[0] ?? null;
    },
    saveLine(line) { mkdirSync(linesDir, { recursive: true }); writeFileSync(path.join(linesDir, `${line.id}.json`), JSON.stringify(line, null, 1) + "\n"); return line; },
    roles: () => json(path.join(dir, "roles.json"), {}),
    setRoles(name, roles) { const r = json(path.join(dir, "roles.json"), {}); if (roles.length) r[name] = roles; else delete r[name]; mkdirSync(dir, { recursive: true }); writeFileSync(path.join(dir, "roles.json"), JSON.stringify(r, null, 1) + "\n"); return r; },
    rulings: () => json(path.join(dir, "rulings.json"), []),
    cases: () => (existsSync(casesDir) ? readdirSync(casesDir).filter((f) => f.endsWith(".json")).map((f) => { const { log: _l, ...c } = json(path.join(casesDir, f)); return c; }).sort((a, b) => b.created - a.created) : []),
    saveCase(c) {
      mkdirSync(casesDir, { recursive: true });
      const full = { id: `${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36)}`, created: Date.now(), ...c };
      writeFileSync(path.join(casesDir, `${full.id}.json`), JSON.stringify(full, null, 1) + "\n"); return full;
    },
  };
}

const counts = (names) => { const h = {}; for (const n of names) h[n] = (h[n] ?? 0) + 1; return h; };
/** What the library expects from this hand: the hand class from the odds model plus the stored line for it. */
export function expectation(kb, handNames) {
  const e = evalHand(model, counts(handNames));
  if (!e) return { class: null, board: 0, nib: false, steps: null, source: "no verified line for this hand" };
  const line = kb.storedLine(e.line);
  return { class: e.line, board: line?.board ?? e.board, nib: line?.nib ?? e.nib, steps: line?.steps ?? null, source: line ? line.source : "odds model (no stored steps)", lineId: line?.id ?? null };
}

/** Where your steps leave the stored steps. followed = longest common subsequence (how much of the line you played). */
export function compareSteps(stored, mine) {
  const key = (s) => `${s.k}:${s.name}`; const a = stored.map(key), b = mine.map(key);
  const L = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  let at = 0; while (at < a.length && at < b.length && a[at] === b[at]) at++;
  const deviation = at === a.length && at === b.length ? null : { at, stored: stored[at] ?? null, yours: mine[at] ?? null };
  return { followed: L[0][0], total: a.length, yours: b.length, deviation };
}

/** The state at the 5th summon of turn 1 (when Nibiru becomes live), found by replaying the action log. null if under 5 summons. */
function sideAtSummonFive(log) {
  const d = replay(log, 0); let side = null;
  for (let i = 0; i < log.responses.length && !side; i++) {
    d.respond(log.responses[i]);
    let n = 0, turn2 = false;
    for (const m of d.messages) { if (m.type === 40 && m.player === 1) turn2 = true; if (!turn2 && (m.type === 60 || m.type === 62) && m.controller === 0) n++; }
    if (n >= 5) side = readSide(d.handle, 0);
    if (turn2) break;
  }
  d.destroy(); return side;
}

/** Grade a drill. `duel` is the live duel (packages/engine/api.mjs); its first hand0 cards of deck0 are the hand. */
export function grade(kb, duel) {
  const cfg = duel.config; const hand = cfg.deck0.slice(0, cfg.hand0).map(nameOf);
  const exp = expectation(kb, hand);
  const side = readSide(duel.handle, 0); const sc = scoreBoard(side);
  const turn1 = []; for (const m of duel.messages) { if (m.type === 40 && m.player === 1) break; turn1.push(m); }
  const mine = steps(turn1);
  const five = sideAtSummonFive(duel.actionLog());
  const nib = five ? nibiruProof(five) : { proof: true, why: "Fewer than 5 summons, so Nibiru was never live" };
  const full = sc.value >= model.fullBoard, expFull = exp.board >= model.fullBoard;
  // the verdict is about the two things the user ranks first: the board, then Nibiru-proof. The numbers stay separate.
  const verdict = !exp.class ? (sc.value > 0 ? "better" : "expected brick")
    : sc.value > exp.board || (sc.value === exp.board && nib.proof && !exp.nib) ? "better"
    : sc.value === exp.board && (nib.proof || !exp.nib) ? "matched" : "below";
  return {
    hand, class: exp.class, verdict,
    board: { yours: sc.value, stored: exp.board, parts: sc.parts.map((p) => p[0]), full, storedFull: expFull },
    nibiru: { yours: nib.proof, stored: exp.nib, why: nib.why },
    handTrapsKept: side.hand.filter((c) => HAND_TRAPS.has(nameOf(c))).length,
    summons: mine.filter((s) => s.k === "summon").length,
    line: exp.steps ? { ...compareSteps(exp.steps, mine), source: exp.source, id: exp.lineId } : null,
    storedSource: exp.source, steps: mine, endBoard: describeBoard(side),
  };
}

/** Promote what you just played to the stored line of its hand class: the next drill of that class expects it. */
export function promote(kb, duel, g) {
  if (!g.class) throw new Error("This hand has no hand class in the odds model yet; report it with That's wrong so a line can be added");
  return kb.saveLine({ id: `user-${slug(g.class)}`, class: g.class, source: "user", legal: true, created: Date.now(), board: g.board.yours, nib: g.nibiru.yours, steps: g.steps, hand: g.hand, log: JSON.parse(JSON.stringify(duel.actionLog(), (_, v) => (typeof v === "bigint" ? { $big: String(v) } : v))) });
}

// ---------- personal results log ----------
/** Your real rates over the logged drills, next to the exact odds for the deck you drilled. */
export function summary(results, deck) {
  const n = results.length; const rate = (f) => (n ? results.filter(f).length / n : 0);
  const odds = deck ? metrics(model, deck) : null;
  return {
    drills: n,
    fullBoard: { yours: rate((r) => r.full), odds: odds?.full1 ?? null },
    nibiruProof: { yours: rate((r) => r.full && r.nib), odds: odds?.nib1 ?? null },
    brick: { yours: rate((r) => r.board === 0), odds: odds?.brick1 ?? null },
    verdicts: Object.fromEntries(["better", "matched", "below", "expected brick"].map((v) => [v, results.filter((r) => r.verdict === v).length])),
    // hands the model calls a brick but you built a board from: the model undercounts there
    modelMissed: results.filter((r) => !r.class && r.board > 0).map((r) => ({ hand: r.hand, board: r.board })),
  };
}
