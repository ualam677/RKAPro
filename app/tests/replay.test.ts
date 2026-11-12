import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { loadCardDb } from "../src/lib/cards/db";
import { learnLine, parseOmegaReplay } from "../src/lib/replay/omega";

const db = loadCardDb();
const name = (c: number) => db.byId.get(c)?.name ?? `#${c}`;
const text = readFileSync(new URL("./fixtures/omega-replay-delta-wing.txt", import.meta.url), "utf8");

describe("YGO Omega replay export", () => {
  const r = parseOmegaReplay(text);
  const l = learnLine(r, name);
  const names = (m: Map<number, number>) => [...m].map(([c, n]) => `${n} ${name(c)}`).sort();

  it("decodes settings and turns", () => {
    expect(r.settings.StartHand).toBe(1);
    expect(r.events.filter((e) => e.kind === "turn").length).toBe(3);
  });

  it("finds the opening hand and what it used", () => {
    expect(l.handUsed.map(name)).toEqual(["Photon Delta Wing"]);
    expect(l.handUnused).toEqual([]);
  });

  it("separates must-stay-in-Deck cards from searched cards", () => {
    expect(names(l.fromDeck)).toEqual(["1 Photon Delta Wing", "1 Photon Emperor", "1 Photon Orbital"]);
    expect(names(l.searched)).toEqual([
      "1 Eternal Galaxy", "1 Galaxy Defense Robot Orbital 7", "1 Galaxy Summoner",
      "1 Galaxy-Eyes Tachyon Primal", "1 Tachyon Transmigration",
    ]);
  });

  it("ignores the opponent's banished Deck and lists Extra Deck + end board", () => {
    expect([...l.fromDeck.keys(), ...l.searched.keys()].map(name)).not.toContain("Key Mace");
    expect(l.extraUsed.map(name)).toContain("Number 104: Masquerade Vain");
    const board = l.endBoard.map((b) => name(b.code));
    expect(board).toContain("Neo Galaxy-Eyes Photon Dragon - Photon Howling");
    expect(board).toContain("Number 38: Hope Harbinger Dragon Titanic Galaxy");
    expect(board).toContain("Galaxy Photon Dragon");
  });

  it("rejects junk", () => {
    expect(() => parseOmegaReplay("hello")).toThrow();
  });
});

import { evaluate } from "../src/lib/combo/engine";
import { buildEffects, buildGoals, routeFromLearned } from "../src/lib/combo/setup";
import { loadGalaxy } from "./galaxy.test";

describe("replay → route → odds", () => {
  it("Delta Wing route from the replay becomes an exact line and changes its odds", () => {
    const G = loadGalaxy();
    const l = learnLine(parseOmegaReplay(text), name);
    const delta = G.main.find((e) => e.card.name === "Photon Delta Wing")!.id;
    const byName = (c: number) => G.main.find((e) => e.card.name === db.byId.get(c)?.name)?.id ?? c;
    const route = routeFromLearned(l, delta, "replay", byName);
    const desc = route.reqs.map((r) => `${r.from}:${name(Number(r.match.slice(5)))}x${r.min}`).sort();
    expect(desc).toEqual([
      "any:Eternal Galaxy x1".replace(" x", "x"), "any:Galaxy Defense Robot Orbital 7x1", "any:Galaxy Summonerx1",
      "any:Galaxy-Eyes Tachyon Primalx1", "any:Tachyon Transmigrationx1",
      "deck:Photon Delta Wingx1", "deck:Photon Emperorx1", "deck:Photon Orbitalx1",
    ].sort());
    const before = buildGoals(G.main, G.setup, G.name, { maxBricks: 2 });
    G.setup[delta] = { ...G.setup[delta], routes: [route] };
    const after = buildGoals(G.main, G.setup, G.name, { maxBricks: 2 });
    expect(after.first.lines.find((x) => x.name.includes("replay"))).toBeTruthy();
    const fx = buildEffects(G.main, G.setup);
    const lineP = (g: typeof before, n: string) => {
      const r = evaluate(G.main, [g.first], fx, { perLine: true })[0];
      return r.perLine[g.first.lines.findIndex((x) => x.name.startsWith(n))];
    };
    console.log("Delta Wing line: guessed", lineP(before, "Photon Delta Wing").toFixed(3), "→ from replay", lineP(after, "Photon Delta Wing").toFixed(3));
  }, 120_000);
});

describe("generalising a replay hand card", () => {
  it("Soldier + 'any LIGHT monster' is far more likely than Soldier + one specific card", () => {
    const G = loadGalaxy();
    const sol = G.main.find((e) => e.card.name === "Galaxy Soldier")!.id;
    const dw = G.main.find((e) => e.card.name === "Photon Delta Wing")!.id;
    const learned = { handUsed: [sol, dw], fromDeck: new Map<number, number>(), searched: new Map<number, number>(), extraUsed: [], endBoard: [] };
    const exact = routeFromLearned(learned, sol, "exact", (c) => c);
    expect(exact.reqs).toContainEqual({ match: `card:${dw}`, min: 1, from: "hand" });
    const general = { ...exact, name: "light", reqs: exact.reqs.map((q) => (q.match === `card:${dw}` ? { ...q, match: "attr:LIGHT" } : q)) };
    const fx = buildEffects(G.main, G.setup);
    const p = (route: typeof exact) => {
      G.setup[sol] = { ...G.setup[sol], routes: [route] };
      const g = buildGoals(G.main, G.setup, G.name, { maxBricks: 2 });
      const r = evaluate(G.main, [g.first], fx, { perLine: true })[0];
      return r.perLine[g.first.lines.findIndex((l) => l.name.startsWith("Galaxy Soldier"))];
    };
    const pe = p(exact), pg = p(general);
    console.log("Soldier route: exact Delta Wing", pe.toFixed(3), "→ any LIGHT", pg.toFixed(3));
    expect(pg).toBeGreaterThan(pe * 1.5);
  }, 120_000);
});
