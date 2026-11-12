import { describe, expect, it } from "vitest";
import { importDeck, CardLookup } from "../src/lib/cards/resolve";
import { Card, normaliseName } from "../src/lib/cards/db";
import { detectFormat } from "../src/lib/deck/detect";
import { parseNameList } from "../src/lib/deck/nameList";
import { parseOmega, toOmega } from "../src/lib/deck/omega";
import { parseYdk, toYdk } from "../src/lib/deck/ydk";
import { parseYdke, toYdke } from "../src/lib/deck/ydke";

// Tiny fake card DB (passcodes are real).
const cards: Card[] = [
  { id: 14558127, name: "Ash Blossom & Joyous Spring", kind: "monster", type: 0x21 },
  { id: 23434538, name: 'Maxx "C"', kind: "monster", type: 0x21 },
  { id: 86066372, name: "Accesscode Talker", kind: "extra", type: 0x4000021 },
  { id: 94145021, name: "Droll & Lock Bird", kind: "monster", type: 0x21 },
];
const db: CardLookup = {
  byId: new Map(cards.map((c) => [c.id, c])),
  byName: new Map(cards.map((c) => [normaliseName(c.name), c])),
};

describe("ydke://", () => {
  it("decodes a known link", () => {
    const d = parseYdke("ydke://y+iNAd3uOQI=!/rTFAw==!3e45Ag==!");
    expect(d).toEqual({ main: [26077387, 37351133], extra: [63288574], side: [37351133] });
  });
  it("round-trips", () => {
    const d = { main: [14558127, 14558127, 23434538], extra: [86066372], side: [] };
    expect(parseYdke(toYdke(d))).toEqual(d);
  });
});

describe(".ydk", () => {
  it("parses sections and ignores comments", () => {
    const d = parseYdk("#created by EDOPro\n#main\n14558127\n14558127\n#extra\n86066372\n!side\n94145021\n");
    expect(d).toEqual({ main: [14558127, 14558127], extra: [86066372], side: [94145021] });
  });
  it("round-trips", () => {
    const d = { main: [1, 2, 3], extra: [4], side: [5] };
    expect(parseYdk(toYdk(d))).toEqual(d);
  });
});

describe("YGO Omega code", () => {
  it("round-trips and keeps main+extra together", () => {
    const code = toOmega({ main: [14558127, 23434538], extra: [86066372], side: [94145021] });
    expect(parseOmega(code)).toEqual({ mainAndExtra: [14558127, 23434538, 86066372], side: [94145021] });
  });
  it("splits Extra Deck cards via the card DB on import", () => {
    const code = toOmega({ main: [14558127, 86066372], extra: [], side: [] }); // extra card stored "wrongly" in main
    const r = importDeck(code, db);
    expect(r.format).toBe("omega");
    expect(r.deck.main).toEqual([14558127]);
    expect(r.deck.extra).toEqual([86066372]);
  });
});

describe("name list recipe", () => {
  it("accepts '3 Name', '3x Name' and 'Name x2' with headers", () => {
    const p = parseNameList("Main Deck:\n3 Ash Blossom & Joyous Spring\nMaxx \"C\" x2\nExtra\n1x Accesscode Talker\nSide:\n- 3 Droll & Lock Bird");
    expect(p.main).toEqual([{ count: 3, name: "Ash Blossom & Joyous Spring" }, { count: 2, name: 'Maxx "C"' }]);
    expect(p.extra).toEqual([{ count: 1, name: "Accesscode Talker" }]);
    expect(p.side).toEqual([{ count: 3, name: "Droll & Lock Bird" }]);
  });
  it("resolves names with curly quotes and auto-sorts Extra Deck cards", () => {
    const r = importDeck("3 ash blossom & joyous spring\n2 Maxx “C”\n1 Accesscode Talker\n1 Not A Real Card", db);
    expect(r.deck.main.length).toBe(5);
    expect(r.deck.extra).toEqual([86066372]);
    expect(r.warnings.some((w) => w.includes("Not A Real Card"))).toBe(true);
  });
});

describe("format detection", () => {
  it.each([
    ["ydke://abc=!!!", "ydke"],
    ["#main\n123", "ydk"],
    ["0+a6LjWfEYbv/L/MAMIXps0AY4kjoiww", "omega"],
    ["3 Ash Blossom", "names"],
  ])("%s -> %s", (input, fmt) => expect(detectFormat(input)).toBe(fmt));
});
