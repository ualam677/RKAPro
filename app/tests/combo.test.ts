import { describe, expect, it } from "vitest";
import { Card } from "../src/lib/cards/db";
import { Effects, evaluate, Goal, Line } from "../src/lib/combo/engine";
import { DeckEntry, matches } from "../src/lib/combo/filters";
import { mulberry32 } from "../src/lib/sim/simulate";

const mk = (id: number, name: string, copies: number, extra: Partial<Card> = {}, roles: string[] = []): DeckEntry => ({
  id, copies, roles, card: { id, name, kind: "monster", type: 0x21, ...extra },
});

// A Galaxy-ish toy deck
const deck: DeckEntry[] = [
  mk(1, "Galaxy Soldier", 1, { attribute: "LIGHT", level: 5 }),
  mk(2, "Galaxy Wizard", 3, { attribute: "LIGHT", level: 4 }),
  mk(3, "Orbital 7", 3, { attribute: "LIGHT", level: 8 }),
  mk(4, "Schwarzschild", 3, { attribute: "DARK", level: 8 }),
  mk(5, "Ghost Ogre", 3, { attribute: "LIGHT", level: 3 }, ["Hand Trap"]),
  mk(6, "Ash Blossom", 3, { attribute: "FIRE", level: 3 }, ["Hand Trap"]),
  mk(7, "Seventh Tachyon", 3, { kind: "spell", type: 0x2 }),
  mk(8, "Pot of Prosperity", 1, { kind: "spell", type: 0x2 }),
  mk(9, "Brick Thing", 2, { kind: "trap", type: 0x4 }, ["Brick"]),
  mk(10, "Filler", 18, { kind: "trap", type: 0x4 }),
];

const soldierLine: Line = { name: "Soldier", reqs: [{ match: "card:1", min: 1 }, { match: "attr:LIGHT", min: 1 }] };
const goal: Goal = {
  name: "open", handSize: 5,
  lines: [soldierLine, { name: "Orbital", reqs: [{ match: "card:3", min: 1 }] }],
  avoid: [{ match: "role:Brick", min: 0, max: 0 }],
};
const fx: Effects = { search: { 7: { target: "level:8+attr:LIGHT" } }, excavate: { 8: 6 } };

/** Independent reference: shuffle physical cards and resolve the same model by brute force. */
function monteCarlo(g: Goal, effects: Effects, trials: number, seed = 7) {
  const cards = deck.flatMap((e) => Array.from({ length: e.copies }, () => e));
  const rand = mulberry32(seed);
  const meets = (hand: DeckEntry[]) => g.lines.some((l) => {
    // brute-force distinct assignment
    const used = new Array(hand.length).fill(false);
    const go = (ri: number, need: number): boolean => {
      if (ri === l.reqs.length) return true;
      if (need === 0) return go(ri + 1, l.reqs[ri + 1]?.min ?? 0);
      for (let i = 0; i < hand.length; i++) if (!used[i] && matches(hand[i], l.reqs[ri].match)) {
        used[i] = true; if (go(ri, need - 1)) { used[i] = false; return true; } used[i] = false;
      }
      return false;
    };
    return go(0, l.reqs[0].min);
  });
  const search = (hand: DeckEntry[], deckLeft: DeckEntry[], usedIds: Set<number>, allowed: Set<number> | null): boolean => {
    if (meets(hand)) return true;
    for (let i = 0; i < hand.length; i++) {
      const s = hand[i]; const cfg = effects.search[s.id];
      if (!cfg || usedIds.has(s.id) || (allowed && !allowed.has(s.id))) continue;
      for (let j = 0; j < deckLeft.length; j++) {
        if (!matches(deckLeft[j], cfg.target)) continue;
        const usedUp = cfg.usedUp ?? s.card.kind !== "monster";
        const nh = hand.filter((_, k) => !(usedUp && k === i)).concat(deckLeft[j]);
        const nd = deckLeft.filter((_, k) => k !== j);
        if (search(nh, nd, new Set([...usedIds, s.id]), allowed)) return true;
      }
    }
    return false;
  };
  let hits = 0;
  for (let t = 0; t < trials; t++) {
    const a = cards.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    const hand = a.slice(0, g.handSize), rest = a.slice(g.handSize);
    if ((g.avoid ?? []).some((r) => hand.filter((c) => matches(c, r.match)).length > (r.max ?? 0))) continue;
    if (search(hand, rest, new Set(), null)) { hits++; continue; }
    const pi = hand.findIndex((c) => effects.excavate[c.id]);
    if (pi >= 0 && rest.length >= 6) {
      const h0 = hand.filter((_, k) => k !== pi);
      const held = new Set(h0.map((c) => c.id));
      const top = rest.slice(0, 6);
      if (top.some((c, k) => search(h0.concat(c), rest.filter((_, m) => m !== k), new Set(), held))) hits++;
    }
  }
  return hits / trials;
}

describe("card-level combo engine", () => {
  it("Galaxy Soldier needs ANOTHER LIGHT monster (distinct copies)", () => {
    const solo: DeckEntry[] = [mk(1, "Galaxy Soldier", 3, { attribute: "LIGHT" }), mk(10, "Filler", 37, { kind: "trap", type: 4 })];
    const g: Goal = { name: "x", handSize: 5, lines: [soldierLine] };
    // needs 2 Soldiers (one discards the other) → P(>=2 of 3 in 5 from 40)
    const exact = evaluate(solo, [g])[0].p;
    const C = (n: number, k: number) => { let r = 1; for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1); return r; };
    const expected = (C(3, 2) * C(37, 3) + C(3, 3) * C(37, 2)) / C(40, 5);
    expect(exact).toBeCloseTo(expected, 10);
  });

  it("matches brute-force Monte Carlo with no effects", () => {
    const exact = evaluate(deck, [goal])[0].p;
    const mc = monteCarlo(goal, { search: {}, excavate: {} }, 60_000);
    expect(Math.abs(exact - mc)).toBeLessThan(0.01);
  });

  it("matches brute-force Monte Carlo with a searcher + Pot of Prosperity", () => {
    const [r] = evaluate(deck, [goal], fx, { perLine: true });
    const mc = monteCarlo(goal, fx, 30_000);
    expect(Math.abs(r.p - mc)).toBeLessThan(0.012);
    expect(r.p).toBeGreaterThan(evaluate(deck, [goal])[0].p); // effects help
    expect(r.perLine.length).toBe(2);
    expect(Math.max(...r.perLine)).toBeLessThanOrEqual(r.p + 1e-12);
  });
});
