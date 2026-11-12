import { readFileSync, existsSync } from "fs";
import { describe, expect, it } from "vitest";
import { loadCardDb } from "../src/lib/cards/db";
import { importDeck } from "../src/lib/cards/resolve";

const db = loadCardDb();

describe("bundled card DB", () => {
  it("knows staple cards, alt arts and Extra Deck types", () => {
    expect(db.byId.get(14558127)?.name).toBe("Ash Blossom & Joyous Spring");
    expect(db.byId.get(14558128)?.name).toBe("Ash Blossom & Joyous Spring"); // alt art
    expect(db.byId.get(86066372)?.kind).toBe("extra");
    expect(db.banlist).toMatch(/TCG/);
  });

  it("has banlist info", () => {
    const limited = [...db.byId.values()].filter((c) => c.limit !== undefined);
    expect(limited.length).toBeGreaterThan(50);
  });

  it("resolves a messy text recipe", () => {
    const r = importDeck("3 ash blossom\n3x Maxx C\nAccesscode Talker x1", db);
    expect(r.deck.main.length).toBe(6);
    expect(r.deck.extra).toEqual([86066372]);
  });

  const ex = "/tmp/omega/examples/formats";
  it.skipIf(!existsSync(ex))("Omega, ydke and ydk examples resolve to real cards", () => {
    for (const f of ["omega.txt", "ydke.txt", "ydk.txt"]) {
      const r = importDeck(readFileSync(`${ex}/${f}`, "utf8"), db, f === "ydk.txt" ? "x.ydk" : undefined);
      const unknown = [...r.deck.main, ...r.deck.extra].filter((id) => !db.byId.has(id));
      expect(unknown, f).toEqual([]);
      expect(r.deck.main.length, f).toBeGreaterThanOrEqual(40);
    }
  });
});

describe("Galaxy list from the user", () => {
  const text = readFileSync(new URL("./fixtures/galaxy.txt", import.meta.url), "utf8");
  it("handles Monster/Spell/Trap headers, properties and suggests names", () => {
    const r = importDeck(text, db);
    expect(r.deck.main.length).toBe(44);
    expect(r.deck.extra.length).toBe(15);
    expect(r.deck.side.length).toBe(12); // 3 Barian's Seventh Untopia unresolved
    expect(r.warnings.join()).toMatch(/Barian Untopia/);
    expect(db.byName.get("ghost ogre snow rabbit")?.attribute).toBe("LIGHT");
    expect(db.byName.get("galaxy soldier")?.level).toBe(5);
  });
});
