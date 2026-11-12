// Exact opening-hand odds from a pack's line table (going 1st: 5 cards, going 2nd: 6 cards).
// Every distinct hand is enumerated with its exact hypergeometric probability and mapped to its best line.
// Pure: no card names, no I/O. The model (lines, groups, hand traps) comes from packs/<deck>/lines.json.
// Erasable-syntax TypeScript only, so Node runs this file directly and Vite bundles it.

export type Counts = Record<string, number>;
export interface Need { any?: string[]; group?: string; min?: number }
export interface Line { name: string; needs: Need[]; board: number; nib: boolean; spendsHandTrap?: number }
export interface Dig { card: string; excavate: number; board: number; nib: boolean }
export interface Model {
  fullBoard: number; handTrapsFirst: string[]; handTrapsSecond: string[];
  groups: Record<string, string[]>; lines: Line[]; digs?: Dig[];
}
export interface HandResult { line: string; board: number; nib: boolean; spendsHandTrap: number; prob?: number }

const namesOf = (m: Model, n: Need) => n.any ?? m.groups[n.group!] ?? [];
const live = (m: Model, h: Counts, l: Line) =>
  l.needs.every((n) => namesOf(m, n).reduce((s, x) => s + (h[x] ?? 0), 0) >= (n.min ?? 1));

/** Best verified line for a hand (counts by name), or null for a brick. `remaining` (the rest of the deck) enables digs. */
export function evalHand(m: Model, h: Counts, remaining?: Counts): HandResult | null {
  let best: Line | null = null;
  for (const l of m.lines) {
    if (!live(m, h, l)) continue;
    if (!best || l.board > best.board || (l.board === best.board && (Number(l.nib) > Number(best.nib) ||
      (l.nib === best.nib && (l.spendsHandTrap ?? 0) < (best.spendsHandTrap ?? 0))))) best = l;
  }
  if (best) return { line: best.name, board: best.board, nib: best.nib, spendsHandTrap: best.spendsHandTrap ?? 0 };
  for (const d of m.digs ?? []) {
    if (!h[d.card] || !remaining) continue; // dig: excavate k, keep 1 that completes the hand
    let ok = 0, D = 0;
    for (const [k, c] of Object.entries(remaining)) { D += c; if (c && evalHand(m, { ...h, [d.card]: 0, [k]: (h[k] ?? 0) + 1 })) ok += c; }
    let miss = 1; for (let i = 0; i < d.excavate; i++) miss *= (D - ok - i) / (D - i);
    return { line: d.card, board: d.board, nib: d.nib, spendsHandTrap: 0, prob: 1 - miss };
  }
  return null;
}

// ---- exact enumeration ----
const lfc = [0];
const lf = (x: number) => { for (let i = lfc.length; i <= x; i++) lfc[i] = lfc[i - 1] + Math.log(i); return lfc[x]; };
const lc = (n: number, k: number) => (k < 0 || k > n ? -Infinity : lf(n) - lf(k) - lf(n - k));

/** Every distinct hand of `size` cards with its exact probability. */
export function* enumerateHands(deck: Counts, size: number): Generator<{ h: Counts; p: number }> {
  const g = Object.entries(deck).filter(([, k]) => k > 0); const N = g.reduce((a, [, k]) => a + k, 0); const tot = lc(N, size);
  const pick = new Array(g.length).fill(0);
  function* rec(i: number, left: number, lp: number): Generator<{ h: Counts; p: number }> {
    if (left === 0) { const h: Counts = {}; g.forEach(([t], j) => { if (pick[j]) h[t] = pick[j]; }); yield { h, p: Math.exp(lp - tot) }; return; }
    if (i === g.length) return;
    for (let x = Math.min(left, g[i][1]); x >= 0; x--) { pick[i] = x; yield* rec(i + 1, left - x, lp + lc(g[i][1], x)); }
    pick[i] = 0;
  }
  yield* rec(0, size, 0);
}

/**
 * Cards the model cannot tell apart (same lines, same hand-trap status) are merged into one group before enumerating.
 * Same numbers, several times fewer hands. Returns the merged deck, keyed by one representative name per group.
 */
export function mergeDeck(m: Model, deck: Counts): Counts {
  const lists: string[][] = [m.handTrapsFirst, m.handTrapsSecond, ...Object.values(m.groups), ...m.lines.flatMap((l) => l.needs.filter((n) => n.any).map((n) => n.any!)), ...(m.digs ?? []).map((d) => [d.card])];
  const sig = (name: string) => lists.map((l) => (l.includes(name) ? "1" : "0")).join("");
  const rep = new Map<string, string>(); const out: Counts = {};
  for (const [name, k] of Object.entries(deck)) {
    if (k <= 0) continue;
    const s = sig(name); if (!rep.has(s)) rep.set(s, name);
    out[rep.get(s)!] = (out[rep.get(s)!] ?? 0) + k;
  }
  return out;
}

export interface Metrics {
  size: number;
  /** going 1st, 5 cards */
  full1: number; nib1: number; partial1: number; brick1: number; full_1ht: number; full_2ht: number; full_3ht: number; eHT1: number; dig: number;
  /** going 2nd, 6 cards */
  combo2: number; ht2_1: number; ht2_2: number; ht2_3: number; combo2_2ht: number;
  /** share of going-1st hands whose best line is this one */
  perLine: Record<string, number>;
}

export function metrics(m: Model, fullDeck: Counts): Metrics {
  const deck = mergeDeck(m, fullDeck);
  const HT1 = new Set(m.handTrapsFirst), HT2 = new Set(m.handTrapsSecond);
  const r: Metrics = { size: Object.values(deck).reduce((a, b) => a + b, 0), full1: 0, nib1: 0, partial1: 0, brick1: 0, full_1ht: 0, full_2ht: 0, full_3ht: 0, eHT1: 0, dig: 0,
    combo2: 0, ht2_1: 0, ht2_2: 0, ht2_3: 0, combo2_2ht: 0, perLine: {} };
  const count = (h: Counts, set: Set<string>) => Object.entries(h).reduce((a, [k, c]) => a + (set.has(k) ? c : 0), 0);
  if (r.size >= 5) for (const { h, p } of enumerateHands(deck, 5)) {
    const remaining = { ...deck }; for (const [k, c] of Object.entries(h)) remaining[k] -= c;
    const e = evalHand(m, h, remaining);
    if (!e) { r.brick1 += p; continue; }
    const q = e.prob ?? 1; const ht = count(h, HT1) - e.spendsHandTrap;
    if (e.prob !== undefined) r.dig += p * q;
    r.brick1 += p * (1 - q);
    r.perLine[e.line] = (r.perLine[e.line] ?? 0) + p * q;
    if (e.board >= m.fullBoard) { r.full1 += p * q; if (e.nib) r.nib1 += p * q; if (ht >= 1) r.full_1ht += p * q; if (ht >= 2) r.full_2ht += p * q; if (ht >= 3) r.full_3ht += p * q; r.eHT1 += p * q * ht; }
    else r.partial1 += p * q;
  }
  if (r.size >= 6) for (const { h, p } of enumerateHands(deck, 6)) {
    const ht = count(h, HT2); const e = evalHand(m, h); const combo = !!e && e.board >= m.fullBoard;
    if (combo) r.combo2 += p; if (ht >= 1) r.ht2_1 += p; if (ht >= 2) r.ht2_2 += p; if (ht >= 3) r.ht2_3 += p; if (combo && ht >= 2) r.combo2_2ht += p;
  }
  return r;
}

export const METRIC_KEYS = ["full1", "nib1", "full_1ht", "full_2ht", "brick1", "ht2_2", "ht2_3", "combo2_2ht"] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];
export const METRIC_LABELS: Record<MetricKey, string> = {
  full1: "1st: full board", nib1: "Nibiru-proof", full_1ht: "full + 1 HT", full_2ht: "full + 2 HT", brick1: "brick",
  ht2_2: "2nd: ≥2 HT", ht2_3: "≥3 HT", combo2_2ht: "combo + 2 HT",
};

/** Per-card marginal value: what each number does when one copy is removed, and when one is added (up to maxCopies). */
export function marginals(m: Model, deck: Counts, maxCopies: (name: string) => number = () => 3) {
  const base = metrics(m, deck);
  const rows = Object.keys(deck).filter((n) => deck[n] > 0).map((name) => ({
    name, copies: deck[name],
    minus: metrics(m, { ...deck, [name]: deck[name] - 1 }),
    plus: deck[name] < maxCopies(name) ? metrics(m, { ...deck, [name]: deck[name] + 1 }) : null,
  }));
  return { base, rows };
}
