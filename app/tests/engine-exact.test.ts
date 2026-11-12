import { describe, expect, it } from "vitest";
import { Card } from "../src/lib/cards/db";
import { Effects, evaluate, Goal } from "../src/lib/combo/engine";
import { DeckEntry } from "../src/lib/combo/filters";
import { referenceProbability } from "./reference";

let nextId = 1;
const mk = (name: string, copies: number, extra: Partial<Card> = {}, roles: string[] = ["Other"]): DeckEntry => {
  const id = nextId++;
  return { id, copies, roles, card: { id, name, kind: "monster", type: 0x21, ...extra } };
};
const L = (e: DeckEntry) => `card:${e.id}`;

/** engine (exact, class-based) must equal exhaustive enumeration over physical cards */
const same = (deck: DeckEntry[], g: Goal, fx: Effects) => {
  const exact = evaluate(deck, [g], fx)[0].p;
  const ref = referenceProbability(deck, g, fx);
  expect(exact).toBeCloseTo(ref, 9);
  return exact;
};

describe("engine == exhaustive reference", () => {
  it("zones: hand starter + deck-only piece + anywhere piece + 2-copy 'any' need", () => {
    const start = mk("Starter", 2, { attribute: "LIGHT" });
    const emperor = mk("Emperor", 1, { attribute: "LIGHT" });
    const eg = mk("EG", 1, { kind: "trap", type: 4 });
    const delta = mk("Delta", 3, { attribute: "LIGHT" });
    const fill = mk("Filler", 7, { kind: "trap", type: 4 });
    const deck = [start, emperor, eg, delta, fill];
    const g: Goal = { name: "g", handSize: 4, lines: [
      { name: "a", reqs: [{ match: L(start), min: 1 }, { match: L(emperor), min: 1, from: "deck" }, { match: L(eg), min: 1, from: "any" }] },
      { name: "b", reqs: [{ match: L(delta), min: 1 }, { match: L(delta), min: 2, from: "any" }, { match: L(emperor), min: 1, from: "deck" }] },
    ] };
    const p = same(deck, g, { search: {}, excavate: {} });
    expect(p).toBeGreaterThan(0.2);
  });

  it("a piece cut to zero kills the lines that need it", () => {
    const start = mk("Starter", 3), eg = mk("EG", 1), fill = mk("Filler", 10);
    const g: Goal = { name: "g", handSize: 5, lines: [{ name: "a", reqs: [{ match: L(start), min: 1 }, { match: L(eg), min: 1, from: "any" }] }] };
    const withEg = evaluate([start, eg, fill], [g])[0].p;
    const noReq = evaluate([start, fill], [{ ...g, lines: [{ name: "a", reqs: [{ match: L(start), min: 1 }] }] }])[0].p;
    expect(evaluate([start, { ...eg, copies: 0 }, fill], [g])[0].p).toBe(0);
    // an "anywhere" piece costs nothing as long as one copy exists (a bit of deck space aside)
    expect(withEg).toBeGreaterThan(noReq - 0.05);
  });

  it("fetcher with a cost (Soldier-style) and a put-back (Tachyon-style rescue of a drawn Emperor)", () => {
    const soldier = mk("Soldier", 1, { attribute: "LIGHT" });
    const wiz = mk("Wizard", 2, { attribute: "LIGHT" });
    const orb = mk("Orbital", 2, { attribute: "LIGHT", level: 8 });
    const emp = mk("Emperor", 1, { attribute: "LIGHT", level: 8 });
    const tach = mk("Tachyon", 2, { kind: "spell", type: 2 });
    const fill = mk("Filler", 8, { kind: "trap", type: 4 });
    const deck = [soldier, wiz, orb, emp, tach, fill];
    const fx: Effects = {
      search: {
        [wiz.id]: { target: `card:${orb.id}` },
        [soldier.id]: { target: `card:${orb.id}`, cost: "attr:LIGHT" },
        [tach.id]: { target: `card:${orb.id}`, putBack: true },
      },
      excavate: {},
    };
    const g: Goal = { name: "g", handSize: 4, lines: [{ name: "orbital", reqs: [{ match: L(orb), min: 1 }, { match: L(emp), min: 1, from: "deck" }] }] };
    const withFx = same(deck, g, fx);
    const without = same(deck, g, { search: {}, excavate: {} });
    expect(withFx).toBeGreaterThan(without);
  });

  it("negated filter: 'Galaxy' fetcher can't fetch itself", () => {
    const wiz = mk("Galaxy Wizard", 2, { attribute: "LIGHT" });
    const orb = mk("Galaxy Orbital", 1, { attribute: "LIGHT" });
    const fill = mk("Filler", 8, { kind: "trap", type: 4 });
    const fx: Effects = { search: { [wiz.id]: { target: "name:Galaxy+!name:Galaxy Wizard" } }, excavate: {} };
    const g: Goal = { name: "g", handSize: 3, lines: [{ name: "o", reqs: [{ match: L(orb), min: 1 }] }] };
    same([wiz, orb, fill], g, fx);
    // Wizard alone can't make a line that needs 2 Wizards in hand
    const g2: Goal = { name: "g2", handSize: 3, lines: [{ name: "w", reqs: [{ match: L(wiz), min: 2 }] }] };
    same([wiz, orb, fill], g2, fx);
  });

  it("excavation + fetchers + brick tolerance", () => {
    const orb = mk("Orbital", 3, { attribute: "LIGHT", level: 8 });
    const wiz = mk("Wizard", 2, { attribute: "LIGHT" });
    const pot = mk("Pot", 1, { kind: "spell", type: 2 });
    const brick = mk("Brick", 2, { attribute: "LIGHT" }, ["Brick"]);
    const fill = mk("Filler", 6, { kind: "trap", type: 4 });
    const fx: Effects = { search: { [wiz.id]: { target: `card:${orb.id}` } }, excavate: { [pot.id]: 3 } };
    for (const max of [0, 1, 2]) {
      const g: Goal = { name: "g", handSize: 4, lines: [{ name: "o", reqs: [{ match: L(orb), min: 1 }] }], avoid: [{ match: "role:Brick", min: 0, max }] };
      same([orb, wiz, pot, brick, fill], g, fx);
    }
  });
});
