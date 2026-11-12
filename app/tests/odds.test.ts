import { describe, expect, it } from "vitest";
import { atLeastOne, choose, Goal, probability } from "../src/lib/odds/hypergeo";
import { optimise } from "../src/lib/odds/optimise";
import { simulate, SimCard } from "../src/lib/sim/simulate";

describe("hypergeometric engine", () => {
  it("matches the textbook P(>=1 of 15 in 5 from 40)", () => {
    const expected = 1 - choose(25, 5) / choose(40, 5); // 0.91925...
    const p = probability({ Starter: 15, Other: 25 }, 5, { name: "s", patterns: [[{ role: "Starter", min: 1 }]] });
    expect(p).toBeCloseTo(expected, 10);
    expect(atLeastOne({ Starter: 15, Other: 25 }, 5).Starter).toBeCloseTo(expected, 10);
  });

  it("all splits sum to 1", () => {
    const p = probability({ A: 9, B: 12, C: 3, Other: 16 }, 6, { name: "any", patterns: [[]] });
    expect(p).toBeCloseTo(1, 12);
  });

  it("agrees with Monte Carlo on a compound goal", () => {
    const deck = { Starter: 12, Extender: 8, HandTrap: 9, Brick: 3, Other: 8 };
    const goal: Goal = {
      name: "good",
      patterns: [
        [{ role: "Starter", min: 1 }, { role: "Brick", max: 0 }],
        [{ role: "Extender", min: 2 }, { role: "HandTrap", min: 1 }],
      ],
    };
    const exact = probability(deck, 5, goal);
    const cards: SimCard[] = Object.entries(deck).flatMap(([r, n]) => Array.from({ length: n }, () => ({ id: 0, roles: [r] })));
    const count = (h: SimCard[], r: string) => h.filter((c) => c.roles[0] === r).length;
    const mc = simulate(cards, 5, (h) =>
      (count(h, "Starter") >= 1 && count(h, "Brick") === 0) || (count(h, "Extender") >= 2 && count(h, "HandTrap") >= 1),
      200_000, 42);
    expect(Math.abs(mc.p - exact)).toBeLessThan(4 * mc.stderr + 1e-3);
  });
});

describe("optimiser", () => {
  it("prefers 40 cards and more starters when only starters matter", () => {
    const best = optimise({
      fixed: { HandTrap: 12 },
      flex: [{ role: "Starter", min: 8, max: 15 }],
      deckSize: { min: 40, max: 42 },
      objectives: [{ goal: { name: "open", patterns: [[{ role: "Starter", min: 1 }]] }, handSize: 5, weight: 1 }],
      top: 1,
    })[0];
    expect(best.deckSize).toBe(40);
    expect(best.counts.Starter).toBe(15);
  });

  it("with fillerRole null, keeps the engine fixed and trades between flex roles", () => {
    const builds = optimise({
      fixed: { Other: 20, Brick: 2 },
      fillerRole: null,
      flex: [{ role: "Starter", min: 6, max: 12 }, { role: "HandTrap", min: 6, max: 12 }],
      deckSize: { min: 40, max: 40 },
      objectives: [{ goal: { name: "s", patterns: [[{ role: "Starter", min: 1 }]] }, handSize: 5, weight: 1 }],
      baseline: { Other: 20, Brick: 2, Starter: 9, HandTrap: 9 },
    });
    for (const b of builds) {
      expect(b.counts.Other).toBe(20);
      expect(b.counts.Starter + b.counts.HandTrap).toBe(18);
    }
    expect(builds[0].counts.Starter).toBe(12);
  });

  it("balances going first vs second objectives", () => {
    const opener: Goal = { name: "combo", patterns: [[{ role: "Starter", min: 1 }]] };
    const interact: Goal = { name: "interact", patterns: [[{ role: "HandTrap", min: 2 }]] };
    const best = optimise({
      fixed: {},
      flex: [{ role: "Starter", min: 6, max: 18 }, { role: "HandTrap", min: 6, max: 18 }],
      deckSize: { min: 40, max: 40 },
      objectives: [{ goal: opener, handSize: 5, weight: 1 }, { goal: interact, handSize: 6, weight: 1 }],
      top: 1,
    })[0];
    expect(best.counts.Starter + best.counts.HandTrap).toBeLessThanOrEqual(40);
    expect(best.counts.Starter).toBeGreaterThanOrEqual(6);
    expect(best.counts.HandTrap).toBeGreaterThanOrEqual(6);
  });
});
