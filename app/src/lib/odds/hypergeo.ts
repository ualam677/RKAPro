/**
 * Exact opening-hand odds over card "roles" (Starter, Extender, Hand Trap, Brick...).
 * Every Main Deck card has exactly one role; untagged cards count as "Other".
 * The maths is a multivariate hypergeometric: enumerate how many of each role
 * land in the hand, weight each split by its probability, and sum the splits
 * that meet the goal. Exact, no sampling, and fast for 5–6 card hands.
 */

export type RoleCounts = Record<string, number>;

/** e.g. { role: "Starter", min: 1 } or { role: "Brick", max: 0 } */
export interface HandRule { role: string; min?: number; max?: number }

/** A goal is met if ANY of its patterns is met; a pattern needs ALL its rules. */
export interface Goal { name: string; patterns: HandRule[][] }

const lnFactCache: number[] = [0];
function lnFact(n: number): number {
  for (let i = lnFactCache.length; i <= n; i++) lnFactCache[i] = lnFactCache[i - 1] + Math.log(i);
  return lnFactCache[n];
}
export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  return Math.round(Math.exp(lnFact(n) - lnFact(k) - lnFact(n - k)));
}

export const ruleMet = (hand: RoleCounts, r: HandRule) => {
  const k = hand[r.role] ?? 0;
  return k >= (r.min ?? 0) && k <= (r.max ?? Infinity);
};
export const goalMet = (hand: RoleCounts, g: Goal) => g.patterns.some((p) => p.every((r) => ruleMet(hand, r)));

/** Call `visit(handSplit, probability)` for every possible role split of the hand. */
export function forEachHandSplit(
  deck: RoleCounts, handSize: number,
  visit: (hand: RoleCounts, p: number) => void,
) {
  const roles = Object.keys(deck).filter((r) => deck[r] > 0);
  const total = roles.reduce((s, r) => s + deck[r], 0);
  if (handSize > total) throw new Error(`Hand of ${handSize} is bigger than the deck (${total})`);
  const denom = choose(total, handSize);
  const hand: RoleCounts = {};
  let remainingAfter = new Array(roles.length + 1).fill(0);
  for (let i = roles.length - 1; i >= 0; i--) remainingAfter[i] = remainingAfter[i + 1] + deck[roles[i]];

  const rec = (i: number, left: number, ways: number) => {
    if (i === roles.length) { if (left === 0) visit(hand, ways / denom); return; }
    if (left > remainingAfter[i]) return; // can't fill the hand from what's left
    const role = roles[i];
    const maxK = Math.min(deck[role], left);
    for (let k = 0; k <= maxK; k++) {
      hand[role] = k;
      rec(i + 1, left - k, ways * choose(deck[role], k));
    }
    hand[role] = 0;
  };
  rec(0, handSize, 1);
}

export function probability(deck: RoleCounts, handSize: number, goal: Goal): number {
  let p = 0;
  forEachHandSplit(deck, handSize, (hand, q) => { if (goalMet(hand, goal)) p += q; });
  return p;
}

/** Handy summary: P(at least 1) of each role. */
export function atLeastOne(deck: RoleCounts, handSize: number): Record<string, number> {
  const out: Record<string, number> = {};
  const total = Object.values(deck).reduce((a, b) => a + b, 0);
  for (const [role, n] of Object.entries(deck)) out[role] = 1 - choose(total - n, handSize) / choose(total, handSize);
  return out;
}

export const HAND_SIZE = { first: 5, second: 6 } as const;
