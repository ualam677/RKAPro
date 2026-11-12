import { Effects, Goal, Line } from "../src/lib/combo/engine";
import { DeckEntry, matches } from "../src/lib/combo/filters";

/**
 * Independent reference for the combo engine: works on PHYSICAL cards (arrays), resolves
 * zones / fetchers / costs / put-backs / excavation by plain recursion. Slow but obviously correct,
 * so the exact engine can be checked against it.
 */

function assignable(pool: DeckEntry[], reqs: { match: string; min: number }[]): boolean {
  if (reqs.length === 0) return true;
  const used = new Array(pool.length).fill(false);
  const go = (ri: number, need: number, from: number): boolean => {
    if (ri === reqs.length) return true;
    if (need === 0) return go(ri + 1, reqs[ri + 1]?.min ?? 0, 0);
    for (let i = from; i < pool.length; i++) {
      if (!used[i] && matches(pool[i], reqs[ri].match)) {
        used[i] = true;
        const ok = go(ri, need - 1, i + 1);
        used[i] = false;
        if (ok) return true;
      }
    }
    return false;
  };
  return go(0, reqs[0].min, 0);
}

export function lineOk(l: Line, hand: DeckEntry[], rest: DeckEntry[]): boolean {
  const z = (zone: string) => l.reqs.filter((r) => (r.from ?? "hand") === zone);
  return assignable(hand, z("hand")) && assignable(rest, z("deck")) && assignable(hand.concat(rest), z("any"));
}

type Cfg = Effects["search"][number];

function reach(hand: DeckEntry[], rest: DeckEntry[], g: Goal, fx: Effects, usedIds: Set<number>, allowed: Set<number> | null): boolean {
  if (g.lines.some((l) => lineOk(l, hand, rest))) return true;
  for (let i = 0; i < hand.length; i++) {
    const s = hand[i]; const cfg: Cfg | undefined = fx.search[s.id];
    if (!cfg || usedIds.has(s.id) || (allowed && !allowed.has(s.id))) continue;
    const costs: (number | null)[] = cfg.cost
      ? hand.map((c, j) => (j !== i && matches(c, cfg.cost!) ? j : -1)).filter((j) => j >= 0)
      : [null];
    for (const cj of costs) {
      for (let t = 0; t < rest.length; t++) {
        if (!matches(rest[t], cfg.target)) continue;
        const nh = hand.filter((_, k) => k !== i && k !== cj).concat(rest[t]);
        const nr = rest.filter((_, k) => k !== t);
        const nu = new Set(usedIds).add(s.id);
        if (cfg.putBack) {
          for (let u = 0; u < nh.length; u++) {
            if (reach(nh.filter((_, k) => k !== u), nr.concat(nh[u]), g, fx, nu, allowed)) return true;
          }
        } else if (reach(nh, nr, g, fx, nu, allowed)) return true;
      }
    }
  }
  return false;
}

const brickOk = (g: Goal, hand: DeckEntry[]) =>
  !(g.avoid ?? []).some((a) => hand.filter((c) => matches(c, a.match)).length > (a.max ?? 0));

/** Exact success probability for one opening hand (excavation averaged over where the cards sit). */
export function handProb(hand: DeckEntry[], rest: DeckEntry[], g: Goal, fx: Effects): number {
  if (!brickOk(g, hand)) return 0;
  if (reach(hand, rest, g, fx, new Set(), null)) return 1;
  let best = 0;
  for (let x = 0; x < hand.length; x++) {
    const dig = fx.excavate[hand[x].id];
    if (!dig || rest.length < dig) continue;
    const h0 = hand.filter((_, k) => k !== x);
    const held = new Set(h0.filter((c) => fx.search[c.id]).map((c) => c.id));
    let good = 0;
    for (let t = 0; t < rest.length; t++) {
      if (reach(h0.concat(rest[t]), rest.filter((_, k) => k !== t), g, fx, new Set(), held)) good++;
    }
    // P(at least one of `dig` random cards is good)
    let pMiss = 1;
    for (let k = 0; k < dig; k++) pMiss *= Math.max(0, (rest.length - good - k) / (rest.length - k));
    best = Math.max(best, 1 - pMiss);
  }
  return best;
}

/** Sampled version for big decks: `rest` is already shuffled, so the top `dig` cards are the excavation. */
export function handSample(hand: DeckEntry[], rest: DeckEntry[], g: Goal, fx: Effects): boolean {
  if (!brickOk(g, hand)) return false;
  if (reach(hand, rest, g, fx, new Set(), null)) return true;
  for (let x = 0; x < hand.length; x++) {
    const dig = fx.excavate[hand[x].id];
    if (!dig) continue;
    const h0 = hand.filter((_, k) => k !== x);
    const held = new Set(h0.filter((c) => fx.search[c.id]).map((c) => c.id));
    for (let t = 0; t < dig; t++) {
      if (reach(h0.concat(rest[t]), rest.filter((_, k) => k !== t), g, fx, new Set(), held)) return true;
    }
  }
  return false;
}

/** Exhaustive: average handProb over every possible opening hand of physical cards. */
export function referenceProbability(deck: DeckEntry[], g: Goal, fx: Effects): number {
  const cards = deck.flatMap((e) => Array.from({ length: e.copies }, () => e));
  const N = cards.length, H = g.handSize;
  let total = 0, sum = 0;
  const idx: number[] = [];
  const rec = (start: number) => {
    if (idx.length === H) {
      const set = new Set(idx);
      const hand = idx.map((i) => cards[i]);
      const rest = cards.filter((_, i) => !set.has(i));
      sum += handProb(hand, rest, g, fx); total++;
      return;
    }
    for (let i = start; i < N; i++) { idx.push(i); rec(i + 1); idx.pop(); }
  };
  rec(0);
  return sum / total;
}
