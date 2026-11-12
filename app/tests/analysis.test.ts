import { describe, expect, it } from "vitest";
import { Counts, enumerateHands, evalHand, marginals, metrics, Model } from "../../packages/analysis/odds.ts";
import model from "../../packs/galaxy-eyes/lines.json";
import pack from "../../packs/galaxy-eyes/deck.json";

const M = model as Model;
const pc = (x: number) => Math.round(x * 1000) / 10;

describe("exact odds from the pack's line table", () => {
  const cur = metrics(M, pack.main), old = metrics(M, pack.replayMain);

  it("reproduces the verified numbers (same as sim/tools/odds.mjs before the port)", () => {
    expect([pc(cur.full1), pc(cur.nib1), pc(cur.full_1ht), pc(cur.full_2ht), pc(cur.brick1), pc(cur.ht2_2), pc(cur.ht2_3), pc(cur.combo2_2ht)])
      .toEqual([93.3, 85.4, 78.2, 41.3, 6.7, 74.0, 39.4, 70.5]);
    expect([pc(old.full1), pc(old.nib1), pc(old.full_2ht), pc(old.brick1)]).toEqual([93.5, 83.8, 41.4, 5.9]);
  });

  it("probabilities add up to 1", () => {
    for (const m of [cur, old]) expect(m.full1 + m.partial1 + m.brick1).toBeCloseTo(1, 9);
    expect(Object.values(cur.perLine).reduce((a, b) => a + b, 0)).toBeCloseTo(1 - cur.brick1, 9);
  });

  it("merging indistinguishable cards does not change the result", () => {
    let full = 0; // enumerate by card name, no merging
    for (const { h, p } of enumerateHands(pack.main, 5)) { const e = evalHand(M, h); if (e && e.board >= M.fullBoard) full += p; }
    expect(full).toBeCloseTo(cur.full1, 9);
  });

  it("matches a Monte Carlo deal within tolerance", () => {
    const deck = Object.entries(pack.main as Counts).flatMap(([n, k]) => Array<string>(k).fill(n));
    let a = 12345; const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    let ok = 0; const N = 40000;
    for (let i = 0; i < N; i++) {
      const d = [...deck]; const h: Counts = {};
      for (let j = 0; j < 5; j++) { const c = d.splice(Math.floor(rnd() * d.length), 1)[0]; h[c] = (h[c] ?? 0) + 1; }
      const e = evalHand(M, h); if (e && e.board >= M.fullBoard) ok++;
    }
    expect(Math.abs(ok / N - cur.full1)).toBeLessThan(0.01);
  });

  it("per-card marginals: cutting a starter raises the brick rate, cutting a hand trap lowers it", () => {
    const { base, rows } = marginals(M, pack.main);
    const row = (n: string) => rows.find((r) => r.name === n)!;
    expect(row("Galaxy Defense Robot Orbital 7").minus.brick1).toBeGreaterThan(base.brick1);
    expect(row("Ash Blossom & Joyous Spring").minus.brick1).toBeLessThan(base.brick1);
    expect(row("Galaxy Soldier").plus).toBeNull(); // already at 3
  });
});
