import { DeckFormat } from "./types";

/** Guess what the user pasted / dropped so they never have to pick a format. */
export function detectFormat(input: string, fileName?: string): DeckFormat {
  const s = input.trim();
  if (fileName?.toLowerCase().endsWith(".ydk")) return "ydk";
  if (/^ydke:\/\//i.test(s)) return "ydke";
  if (/^#main/im.test(s) || /^#created by/im.test(s)) return "ydk";
  // Omega codes: one line of base64, no spaces, decently long.
  if (!/\s/.test(s) && /^[A-Za-z0-9+/=_-]{16,}$/.test(s)) return "omega";
  return "names";
}
