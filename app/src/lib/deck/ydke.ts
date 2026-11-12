import { base64ToBytes, bytesToBase64 } from "./base64";
import { Deck, DeckParseError } from "./types";

/**
 * ydke:// URL — EDOPro's "copy deck" format, also used by YGOPRODeck.
 *   ydke://<main>!<extra>!<side>!
 * Each part is base64 of little-endian uint32 passcodes.
 */
const PREFIX = "ydke://";

function decodePart(part: string): number[] {
  if (!part) return [];
  const bytes = base64ToBytes(part);
  if (bytes.length % 4 !== 0) throw new DeckParseError("Corrupt ydke part (length not a multiple of 4)");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i += 4) out.push(view.getUint32(i, true));
  return out;
}

function encodePart(codes: number[]): string {
  const bytes = new Uint8Array(codes.length * 4);
  const view = new DataView(bytes.buffer);
  codes.forEach((c, i) => view.setUint32(i * 4, c, true));
  return bytesToBase64(bytes);
}

export function parseYdke(url: string): Deck {
  const s = url.trim();
  if (!s.toLowerCase().startsWith(PREFIX)) throw new DeckParseError("Not a ydke:// link");
  const parts = s.slice(PREFIX.length).split("!");
  if (parts.length < 3) throw new DeckParseError("ydke:// link is missing sections");
  return { main: decodePart(parts[0]), extra: decodePart(parts[1]), side: decodePart(parts[2]) };
}

export function toYdke(deck: Deck): string {
  return `${PREFIX}${encodePart(deck.main)}!${encodePart(deck.extra)}!${encodePart(deck.side)}!`;
}
