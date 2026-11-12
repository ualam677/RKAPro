import { deflateSync, inflateSync } from "fflate";
import { base64ToBytes, bytesToBase64 } from "./base64";
import { Deck, DeckParseError, UnsplitDeck } from "./types";

/**
 * YGO Omega deck code:
 *   base64( rawDeflate( [u8 mainPlusExtraCount][u8 sideCount][u32le passcodes...] ) )
 * Main and Extra are stored together, so the caller must split them using card types
 * (see cards/resolve.ts). Layout from github.com/ungive/omega-api-decks.
 */
export function parseOmega(code: string): UnsplitDeck {
  let raw: Uint8Array;
  try {
    raw = inflateSync(base64ToBytes(code.trim()));
  } catch {
    throw new DeckParseError("Not a valid YGO Omega code");
  }
  if (raw.length < 2) throw new DeckParseError("Omega code is too short");
  const mainExtra = raw[0];
  const side = raw[1];
  // Codes embedded in replay exports (Deck0) carry 4 extra trailing bytes; ignore anything after the card list.
  if (raw.length < 2 + 4 * (mainExtra + side)) throw new DeckParseError("Omega code length mismatch");

  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const read = (i: number) => view.getUint32(2 + i * 4, true);
  const all = Array.from({ length: mainExtra + side }, (_, i) => read(i));
  return { mainAndExtra: all.slice(0, mainExtra), side: all.slice(mainExtra) };
}

export function toOmega(deck: Deck): string {
  const codes = [...deck.main, ...deck.extra, ...deck.side];
  const raw = new Uint8Array(2 + codes.length * 4);
  const view = new DataView(raw.buffer);
  raw[0] = deck.main.length + deck.extra.length;
  raw[1] = deck.side.length;
  codes.forEach((c, i) => view.setUint32(2 + i * 4, c, true));
  return bytesToBase64(deflateSync(raw));
}
