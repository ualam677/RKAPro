import { Deck, DeckParseError, emptyDeck } from "./types";

/**
 * .ydk — the text file used by EDOPro, YGO Omega, YGOPro, YGOPRODeck.
 *   #created by ...
 *   #main
 *   89631139
 *   #extra
 *   ...
 *   !side
 *   ...
 */
export function parseYdk(text: string): Deck {
  const deck = emptyDeck();
  let section: keyof Pick<Deck, "main" | "extra" | "side"> | null = null;
  let sawHeader = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    if (lower === "#main") { section = "main"; sawHeader = true; continue; }
    if (lower === "#extra") { section = "extra"; sawHeader = true; continue; }
    if (lower === "!side") { section = "side"; sawHeader = true; continue; }
    if (line.startsWith("#") || line.startsWith("!")) continue; // comments like "#created by"

    const code = Number.parseInt(line, 10);
    if (!Number.isFinite(code) || code <= 0) continue; // tolerate junk lines
    if (!section) throw new DeckParseError("Card found before a #main/#extra/!side header");
    deck[section].push(code);
  }

  if (!sawHeader) throw new DeckParseError("Not a .ydk file (no #main header)");
  return deck;
}

export function toYdk(deck: Deck): string {
  return [
    "#created by YGO Ratio Optimiser",
    "#main", ...deck.main.map(String),
    "#extra", ...deck.extra.map(String),
    "!side", ...deck.side.map(String),
    "",
  ].join("\n");
}
