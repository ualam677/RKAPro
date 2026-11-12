import { describe, expect, it } from "vitest";
import { quick, QuickCard } from "../../packages/analysis/quick.ts";

const C = (n: number, k: number): number => (k < 0 || k > n ? 0 : k === 0 ? 1 : (C(n - 1, k - 1) * n) / k);
const filler = (n: number): QuickCard[] => Array.from({ length: n }, (_, i) => ({ name: `Filler ${i}`, copies: 1 }));
const run = (cards: QuickCard[], extra: Partial<Parameters<typeof quick>[0]> = {}) => quick({ cards, pairs: [], picks: [], handSize: 5, ...extra });

describe("quick calculator (closed-form checks, 40 cards)", () => {
  it("at least one starter = 1 - C(31,5)/C(40,5)", () => {
    const r = run([{ name: "A", copies: 3, starter: true }, { name: "B", copies: 3, starter: true }, { name: "C", copies: 3, starter: true }, ...filler(31)]);
    expect(r.anyStarter).toBeCloseTo(1 - C(31, 5) / C(40, 5), 10);
    expect(r.anyStarter + r.noStarter).toBeCloseTo(1, 10);
  });

  it("Normal Summon starters share one play; other starters count by distinct name", () => {
    const ns = run([{ name: "A", copies: 3, starter: true, ns: true }, { name: "B", copies: 3, starter: true, ns: true }, ...filler(34)]);
    expect(ns.twoPlays).toBe(0);
    const free = run([{ name: "A", copies: 3, starter: true }, { name: "B", copies: 3, starter: true }, ...filler(34)]);
    // both A and B present: 1 - P(no A) - P(no B) + P(neither)
    expect(free.twoPlays).toBeCloseTo(1 - 2 * C(37, 5) / C(40, 5) + C(34, 5) / C(40, 5), 10);
  });

  it("a 2-card pair of non-starters is a play; hand traps and min/max copies are exact", () => {
    const r = run([{ name: "X", copies: 3 }, { name: "Y", copies: 2 }, { name: "HT", copies: 9, handTrap: true }, ...filler(26)],
      { pairs: [["X", "Y"]], picks: [{ name: "X", min: 1, max: 1 }] });
    const both = 1 - C(37, 5) / C(40, 5) - C(38, 5) / C(40, 5) + C(35, 5) / C(40, 5);
    expect(r.pairs[0]).toBeCloseTo(both, 10);
    expect(r.anyStarter).toBeCloseTo(both, 10);
    expect(r.handTraps[0]).toBeCloseTo(1 - C(31, 5) / C(40, 5), 10);
    expect(r.picks[0]).toBeCloseTo((3 * C(37, 4)) / C(40, 5), 10);
  });
});
