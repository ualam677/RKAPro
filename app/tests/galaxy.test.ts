import { describe, expect, it } from "vitest";
import { loadCardDb } from "../src/lib/cards/db";
import { importDeck } from "../src/lib/cards/resolve";
import { evaluate } from "../src/lib/combo/engine";
import { DeckEntry } from "../src/lib/combo/filters";
import { autoSetup, buildEffects, buildGoals, GALAXY_PRESET, hasRole, resolvePreset, rolesOf, SetupMap } from "../src/lib/combo/setup";
import { countCards } from "../src/lib/deck/types";
import { GALAXY_EXAMPLE } from "../src/lib/examples";
import { mulberry32 } from "../src/lib/sim/simulate";
import { handSample } from "./reference";

export function loadGalaxy() {
  const db = loadCardDb();
  const { deck } = importDeck(GALAXY_EXAMPLE, db);
  const all = [...deck.main, ...deck.side];
  const idOfName = (n: string) => all.find((x) => db.byId.get(x)!.name === n);
  const setup: SetupMap = {};
  const entries = (ids: number[]): DeckEntry[] => [...countCards(ids)].map(([id, copies]) => {
    const card = db.byId.get(id)!;
    const p = GALAXY_PRESET[card.name];
    setup[id] = p ? resolvePreset(p, idOfName) : autoSetup(card);
    return { id, card, copies, roles: rolesOf(setup[id]) };
  });
  const main = entries(deck.main), side = entries(deck.side);
  const name = (id: number) => db.byId.get(id)!.name;
  return { db, main, side, setup, name, deck };
}

describe("Galaxy list", () => {
  const G = loadGalaxy();
  const byName = (n: string) => G.main.find((e) => e.card.name === n)!;

  it("every card in the Main Deck has a reason (preset note) or is a known hand trap / breaker", () => {
    for (const e of G.main) {
      const s = G.setup[e.id];
      expect(s.note || s.roles.length > 0, e.card.name).toBeTruthy();
    }
  });

  it("the guides' 8 'never draw' cards are exactly the bricks", () => {
    const bricks = G.main.filter((e) => G.setup[e.id].brick).map((e) => e.card.name).sort();
    expect(bricks).toEqual([
      "Eternal Galaxy", "Galaxy Summoner", "Galaxy-Eyes Afterglow Dragon", "Galaxy-Eyes Photon Dragon",
      "Galaxy-Eyes Tachyon Primal", "Photon Emperor", "Photon Orbital", "Tachyon Transmigration",
    ]);
  });

  it("roles match what the owner said", () => {
    const s = (n: string) => G.setup[byName(n).id];
    expect(hasRole(s("Forbidden Crown"), "Board Breaker")).toBe(true);
    expect(hasRole(s("Galaxy-Eyes Afterglow Dragon"), "Combo piece") && hasRole(s("Galaxy-Eyes Afterglow Dragon"), "Extender")).toBe(true);
    expect(hasRole(s("Galaxy Summoner"), "Combo piece") && !hasRole(s("Galaxy Summoner"), "Starter")).toBe(true);
  });

  it("going-1st odds match a physical-card simulation (zones, fetchers, put-back, Pot, brick tolerance)", () => {
    const goals = buildGoals(G.main, G.setup, G.name, { maxBricks: 2 });
    const fx = buildEffects(G.main, G.setup);
    const exact = evaluate(G.main, [goals.first], fx)[0].p;
    const cards = G.main.flatMap((e) => Array.from({ length: e.copies }, () => e));
    const rand = mulberry32(11); let hits = 0; const T = 20_000;
    for (let t = 0; t < T; t++) {
      const a = cards.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      if (handSample(a.slice(0, 5), a.slice(5), goals.first, fx)) hits++;
    }
    const mc = hits / T;
    console.log("Galaxy going 1st — exact", exact.toFixed(4), "simulated", mc.toFixed(4));
    expect(Math.abs(exact - mc)).toBeLessThan(0.012);
  }, 300_000);

  it("no card the guides rely on is a free cut", () => {
    const goals = buildGoals(G.main, G.setup, G.name, { maxBricks: 2 });
    const fx = buildEffects(G.main, G.setup);
    const base = evaluate(G.main, [goals.first, goals.second], fx).map((r) => r.p);
    for (const n of ["Eternal Galaxy", "Tachyon Transmigration", "Galaxy Summoner", "Galaxy-Eyes Tachyon Primal", "Photon Emperor"]) {
      const cut = G.main.map((e) => (e.card.name === n ? { ...e, copies: 0 } : e));
      const g2 = buildGoals(cut, G.setup, G.name, { maxBricks: 2 });
      const p = evaluate(cut, [g2.first], fx)[0].p;
      expect(p, n).toBeLessThan(base[0] - 0.2); // cutting the only copy collapses the lines that need it
    }
  });
});
