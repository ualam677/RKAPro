import { detectFormat } from "../deck/detect";
import { parseNameList, NameListEntry } from "../deck/nameList";
import { parseOmega } from "../deck/omega";
import { Deck, DeckFormat, DeckParseError } from "../deck/types";
import { parseYdk } from "../deck/ydk";
import { parseYdke } from "../deck/ydke";
import { CardDb, findByName, isExtraDeckCard, suggestNames } from "./db";

export interface ImportResult {
  deck: Deck;
  format: DeckFormat;
  warnings: string[];
}

/** Minimal card lookup so this module is testable without the network. */
export type CardLookup = Pick<CardDb, "byId" | "byName">;

/**
 * Map a passcode to the card it prints. Alternate artworks usually sit just above the base passcode
 * (e.g. YGO Omega exports Ghost Ogre as 59438932 and Impermanence as 10045475), so an unknown code
 * falls back to the nearest card up to 10 below it, with a warning.
 */
export function canonicalCode(code: number, db: CardLookup, warnings?: string[]): number {
  const card = db.byId.get(code);
  if (card) return card.id;
  for (let d = 1; d <= 10; d++) {
    const base = db.byId.get(code - d);
    if (base) { warnings?.push(`Treated passcode ${code} as an alternate artwork of ${base.name}`); return base.id; }
  }
  return code;
}

function splitMainExtra(rawCodes: number[], db: CardLookup, warnings: string[]) {
  const main: number[] = [];
  const extra: number[] = [];
  const codes = rawCodes.map((c) => canonicalCode(c, db, warnings));
  for (const code of codes) {
    const card = db.byId.get(code);
    if (!card) warnings.push(`Unknown passcode ${code} — kept in Main Deck`);
    (card && isExtraDeckCard(card) ? extra : main).push(code);
  }
  return { main, extra };
}

function namesToCodes(entries: NameListEntry[], db: CardLookup, warnings: string[]): number[] {
  const out: number[] = [];
  for (const e of entries) {
    const card = findByName(db, e.name);
    if (!card) {
      const s = suggestNames(db, e.name);
      warnings.push(`Couldn't find a card called "${e.name}"${s.length ? ` — did you mean ${s.map((x) => `"${x}"`).join(" or ")}?` : ""}`);
      continue;
    }
    for (let i = 0; i < e.count; i++) out.push(card.id);
  }
  return out;
}

/** One entry point for every import: paste box, file drop, or URL param. */
export function importDeck(input: string, db: CardLookup, fileName?: string): ImportResult {
  const format = detectFormat(input, fileName);
  const warnings: string[] = [];
  let deck: Deck;

  switch (format) {
    case "ydk": deck = parseYdk(input); break;
    case "ydke": deck = parseYdke(input); break;
    case "omega": {
      const u = parseOmega(input);
      deck = { ...splitMainExtra(u.mainAndExtra, db, warnings), side: u.side };
      break;
    }
    case "names": {
      const p = parseNameList(input);
      const unsorted = splitMainExtra(namesToCodes(p.unsorted, db, warnings), db, warnings);
      deck = {
        main: [...namesToCodes(p.main, db, warnings), ...unsorted.main],
        extra: [...namesToCodes(p.extra, db, warnings), ...unsorted.extra],
        side: namesToCodes(p.side, db, warnings),
      };
      break;
    }
  }

  if (format === "ydk" || format === "ydke") {
    const fix = (a: number[]) => a.map((c) => canonicalCode(c, db, warnings));
    deck = { main: fix(deck.main), extra: fix(deck.extra), side: fix(deck.side) };
  } else if (format === "omega") deck = { ...deck, side: deck.side.map((c) => canonicalCode(c, db, warnings)) };
  const seenWarn = new Set<string>(); for (let i = warnings.length - 1; i >= 0; i--) { if (seenWarn.has(warnings[i])) warnings.splice(i, 1); else seenWarn.add(warnings[i]); }

  if (deck.main.length === 0) throw new DeckParseError("Imported deck has no Main Deck cards");
  if (deck.main.length < 40 || deck.main.length > 60) warnings.push(`Main Deck has ${deck.main.length} cards (legal: 40–60)`);
  if (deck.extra.length > 15) warnings.push(`Extra Deck has ${deck.extra.length} cards (max 15)`);
  if (deck.side.length > 15) warnings.push(`Side Deck has ${deck.side.length} cards (max 15)`);
  return { deck, format, warnings };
}
