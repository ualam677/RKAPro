/**
 * Stage 2 (scaffold): Monte Carlo hand simulator at the *card* level.
 *
 * Why it exists alongside the exact maths: real combos care about specific cards,
 * cards that fill more than one role (a starter that's also a hand trap), and
 * draw/search effects (Pot of Prosperity, Pot of Desires, searchers). Those break
 * the "one role per card" assumption, so we sample hands instead.
 *
 * Today: shuffle, draw, test a predicate. Next: ComboLine definitions + card effects.
 */

export interface SimCard { id: number; roles: string[] }

/** A combo line: needs ALL of `requires`, each requirement satisfied by any listed card. */
export interface ComboLine { name: string; requires: { anyOf: number[]; count?: number }[] }

export function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function lineMet(hand: SimCard[], line: ComboLine): boolean {
  const used = new Set<number>(); // a hand card can only satisfy one requirement
  return line.requires.every((req) => {
    let need = req.count ?? 1;
    hand.forEach((c, i) => {
      if (need > 0 && !used.has(i) && req.anyOf.includes(c.id)) { used.add(i); need--; }
    });
    return need === 0;
  });
}

export function simulate(
  deck: SimCard[], handSize: number,
  test: (hand: SimCard[]) => boolean,
  trials = 100_000, seed = 1,
): { p: number; stderr: number } {
  const rand = mulberry32(seed);
  const a = deck.slice();
  let hits = 0;
  for (let t = 0; t < trials; t++) {
    // partial Fisher–Yates: only shuffle the cards we draw
    for (let i = 0; i < handSize; i++) {
      const j = i + Math.floor(rand() * (a.length - i));
      [a[i], a[j]] = [a[j], a[i]];
    }
    if (test(a.slice(0, handSize))) hits++;
  }
  const p = hits / trials;
  return { p, stderr: Math.sqrt((p * (1 - p)) / trials) };
}
