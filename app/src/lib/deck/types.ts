/** A deck as lists of Konami passcodes (duplicates repeated). */
export interface Deck {
  main: number[];
  extra: number[];
  side: number[];
  name?: string;
}

/**
 * Some formats (YGO Omega codes, plain name lists) don't say which cards are
 * Main vs Extra. These come back "unsplit" and get resolved against the card DB.
 */
export interface UnsplitDeck {
  mainAndExtra: number[];
  side: number[];
  name?: string;
}

export type DeckFormat = "ydk" | "ydke" | "omega" | "names";

export class DeckParseError extends Error {}

export const emptyDeck = (): Deck => ({ main: [], extra: [], side: [] });

/** Collapse a passcode list into [passcode, count] pairs, preserving first-seen order. */
export function countCards(codes: number[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const c of codes) m.set(c, (m.get(c) ?? 0) + 1);
  return m;
}
