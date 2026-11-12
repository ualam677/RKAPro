import { DeckParseError } from "./types";

/**
 * Plain-text recipe, e.g. copied from a tournament decklist or YGOPRODeck:
 *   Main Deck:
 *   3 Ash Blossom & Joyous Spring
 *   Maxx "C" x2
 *   Extra:
 *   1 Accesscode Talker
 *   Side
 *   3 Droll & Lock Bird
 * Section headers are optional; without them everything lands in "unsorted"
 * and is split Main/Extra using the card database.
 */
export interface NameListEntry { name: string; count: number }
export interface ParsedNameList {
  main: NameListEntry[];
  extra: NameListEntry[];
  side: NameListEntry[];
  unsorted: NameListEntry[];
}

// Section headers. "Monster(s)/Spell(s)/Trap(s)" (YGOPRODeck / tournament sheet style) all mean Main Deck.
const HEADER = /^(main|extra|side|monsters?|spells?|traps?)(\s*(deck|cards?))?\s*:?\s*(\(\d+\)|\d+)?$/i;
const SECTION_OF: Record<string, keyof ParsedNameList> = {
  main: "main", extra: "extra", side: "side",
  monster: "main", monsters: "main", spell: "main", spells: "main", trap: "main", traps: "main",
};
const LEADING = /^(\d+)\s*[xX×]?\s+(.+)$/;   // "3 Ash" / "3x Ash"
const TRAILING = /^(.+?)\s+[xX×]\s*(\d+)$/;  // "Ash x3"

export function parseNameList(text: string): ParsedNameList {
  const out: ParsedNameList = { main: [], extra: [], side: [], unsorted: [] };
  let section: keyof ParsedNameList = "unsorted";

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-*•]\s*/, "");
    if (!line) continue;
    const h = line.match(HEADER);
    if (h) { section = SECTION_OF[h[1].toLowerCase()]; continue; }

    let m = line.match(LEADING);
    let entry: NameListEntry | null = null;
    if (m) entry = { count: Number(m[1]), name: m[2].trim() };
    else if ((m = line.match(TRAILING))) entry = { count: Number(m[2]), name: m[1].trim() };
    else entry = { count: 1, name: line };

    if (entry.count < 1 || entry.count > 3) throw new DeckParseError(`Bad copy count on line: "${line}"`);
    out[section].push(entry);
  }
  const total = out.main.length + out.extra.length + out.side.length + out.unsorted.length;
  if (total === 0) throw new DeckParseError("No cards found in the list");
  return out;
}
