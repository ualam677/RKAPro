import { inflateSync } from "fflate";
import { base64ToBytes } from "../deck/base64";

/**
 * YGO Omega replay export (the text you get from "Export" on a replay):
 *   base64( rawDeflate( BSON document ) )
 * The document holds GameSettings, Deck0 (an Omega deck code) and GameMessages: the
 * duel engine's messages (EDOPro / ocgcore numbering), each one a binary blob whose
 * first byte is the message type. Omega packs card locations into 4 bytes
 * (controller, location, sequence, position).
 */

// ---------------- minimal BSON reader ----------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Bson = Record<string, any>;
function readBson(b: Uint8Array, start = 0): Bson {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const len = v.getInt32(start, true);
  const end = start + len;
  let i = start + 4;
  const out: Bson = {};
  const dec = new TextDecoder();
  while (i < end - 1) {
    const t = b[i++];
    let j = i; while (b[j] !== 0) j++;
    const key = dec.decode(b.subarray(i, j)); i = j + 1;
    switch (t) {
      case 0x01: out[key] = v.getFloat64(i, true); i += 8; break;
      case 0x02: { const L = v.getInt32(i, true); out[key] = dec.decode(b.subarray(i + 4, i + 3 + L)); i += 4 + L; break; }
      case 0x03: case 0x04: { out[key] = readBson(b, i); i += v.getInt32(i, true); break; }
      case 0x05: { const L = v.getInt32(i, true); out[key] = b.subarray(i + 5, i + 5 + L); i += 5 + L; break; }
      case 0x08: out[key] = b[i] !== 0; i += 1; break;
      case 0x09: case 0x12: out[key] = Number(v.getBigInt64(i, true)); i += 8; break;
      case 0x0a: out[key] = null; break;
      case 0x10: out[key] = v.getInt32(i, true); i += 4; break;
      default: throw new Error(`Unsupported BSON type 0x${t.toString(16)} in replay`);
    }
  }
  return out;
}

// ---------------- events ----------------
export type Zone = "Deck" | "Hand" | "Field" | "S/T" | "GY" | "Banished" | "Extra" | "Material" | "?";
const ZONE: Record<number, Zone> = { 1: "Deck", 2: "Hand", 4: "Field", 8: "S/T", 0x10: "GY", 0x20: "Banished", 0x40: "Extra" };
const zoneOf = (l: number): Zone => ZONE[l] ?? (l & 0x80 ? "Material" : "?");

export type ReplayEvent =
  | { kind: "turn"; turn: number; player: number }
  | { kind: "phase"; phase: string }
  | { kind: "draw"; player: number; code: number }
  | { kind: "move"; code: number; player: number; from: Zone; to: Zone }
  | { kind: "summon"; code: number; player: number; how: "Normal" | "Special" }
  | { kind: "activate"; code: number; player: number; from: Zone }
  | { kind: "set"; code: number; player: number }
  | { kind: "win"; player: number };

const PHASE: Record<number, string> = { 1: "Draw", 2: "Standby", 4: "Main 1", 8: "Battle", 0x100: "Main 2", 0x200: "End" };

export interface Replay {
  settings: Record<string, number>;
  deckCode?: string;
  events: ReplayEvent[];
}

export class ReplayParseError extends Error {}

export function parseOmegaReplay(text: string): Replay {
  let doc: Bson;
  try {
    doc = readBson(inflateSync(base64ToBytes(text.trim())));
  } catch (e) {
    throw new ReplayParseError(`Not a YGO Omega replay export (${(e as Error).message})`);
  }
  if (!doc.GameMessages) throw new ReplayParseError("Replay has no game messages");
  const msgs = Object.values(doc.GameMessages as Record<string, Uint8Array>);
  const events: ReplayEvent[] = [];
  let turn = 0;
  for (const m of msgs) {
    if (!(m instanceof Uint8Array) || m.length < 2) continue;
    const t = m[0], b = m.subarray(1);
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const u32 = (o: number) => (b.length >= o + 4 ? v.getUint32(o, true) : 0);
    switch (t) {
      case 40: events.push({ kind: "turn", turn: ++turn, player: b[0] }); break;
      case 41: events.push({ kind: "phase", phase: PHASE[v.getUint16(0, true)] ?? "?" }); break;
      case 90: { // player u8, count u8, then code u32 (+ maybe more)
        const n = b[1];
        for (let k = 0; k < n; k++) events.push({ kind: "draw", player: b[0], code: u32(2 + 4 * k) });
        break;
      }
      case 50: if (b.length >= 12) events.push({ kind: "move", code: u32(0), player: b[8], from: zoneOf(b[5]), to: zoneOf(b[9]) }); break;
      case 60: case 62: if (b.length >= 8) events.push({ kind: "summon", code: u32(0), player: b[4], how: t === 60 ? "Normal" : "Special" }); break;
      case 54: if (b.length >= 8) events.push({ kind: "set", code: u32(0), player: b[4] }); break;
      case 70: if (b.length >= 8) events.push({ kind: "activate", code: u32(0), player: b[4], from: zoneOf(b[5]) }); break;
      case 5: events.push({ kind: "win", player: b[0] }); break;
    }
  }
  const settings: Record<string, number> = {};
  for (const [k, val] of Object.entries(doc.GameSettings ?? {})) if (typeof val === "number") settings[k] = val;
  return { settings, deckCode: typeof doc.Deck0 === "string" ? doc.Deck0 : undefined, events };
}

// ---------------- from events to a combo line ----------------
export interface LearnedLine {
  player: number;
  turn: number;
  /** Cards in the opening hand that the combo used (left the hand during the turn). */
  handUsed: number[];
  /** Cards in the opening hand that were never used. */
  handUnused: number[];
  /** Cards taken from the Deck straight to the field / GY / as material: these must STAY in the Deck. */
  fromDeck: Map<number, number>;
  /** Cards added from the Deck to the hand: drawing one instead is fine, they just have to be in the 40. */
  searched: Map<number, number>;
  /** Extra Deck monsters summoned. */
  extraUsed: number[];
  /** Your cards on the field / set at the end of the turn. */
  endBoard: { code: number; zone: Zone }[];
  /** Readable steps for the combo turn. */
  steps: string[];
}

/**
 * Read the combo: the first turn of the player whose draws are visible (you).
 * Opponent's actions and the opponent's Deck are ignored.
 */
export function learnLine(r: Replay, nameOf: (code: number) => string): LearnedLine {
  const firstDraw = r.events.find((e): e is Extract<ReplayEvent, { kind: "draw" }> => e.kind === "draw" && e.code !== 0);
  const me = firstDraw?.player ?? 0;
  const firstTurnIdx = r.events.findIndex((e) => e.kind === "turn" && e.player === me);
  if (firstTurnIdx < 0) throw new ReplayParseError("Couldn't find your turn in the replay");
  const turn = (r.events[firstTurnIdx] as { turn: number }).turn;
  let endIdx = r.events.findIndex((e, i) => i > firstTurnIdx && e.kind === "turn");
  if (endIdx < 0) endIdx = r.events.length;

  // opening hand = your visible draws before the end of your first turn's Draw Phase moves
  const hand: number[] = [];
  for (let i = 0; i < endIdx; i++) {
    const e = r.events[i];
    if (e.kind === "draw" && e.player === me && e.code) hand.push(e.code);
  }

  const fromDeck = new Map<number, number>(), searched = new Map<number, number>();
  const handLeft: number[] = [];
  const extraUsed: number[] = [];
  const steps: string[] = [];
  const zones = new Map<string, number>(); // `${code}|${zone}` -> count, for the end board
  const bump = (code: number, z: Zone, d: number) => zones.set(`${code}|${z}`, (zones.get(`${code}|${z}`) ?? 0) + d);
  const add = (m: Map<number, number>, c: number) => m.set(c, (m.get(c) ?? 0) + 1);

  for (let i = firstTurnIdx + 1; i < endIdx; i++) {
    const e = r.events[i];
    if (e.kind === "activate" && e.player === me) steps.push(`Activate ${nameOf(e.code)}${e.from !== "Field" ? ` (from ${e.from})` : ""}`);
    if (e.kind === "summon" && e.player === me) steps.push(`${e.how} Summon ${nameOf(e.code)}`);
    if (e.kind === "set" && e.player === me && e.code) steps.push(`Set ${nameOf(e.code)}`);
    if (e.kind !== "move" || e.player !== me || !e.code) continue;
    if (e.from === "Material" && e.to === "Material") continue;
    bump(e.code, e.from, -1); bump(e.code, e.to, +1);
    if (e.from === "Deck" && e.to === "Hand") { add(searched, e.code); steps.push(`  → add ${nameOf(e.code)} from Deck`); }
    else if (e.from === "Deck" && e.to !== "Deck" && e.to !== "Banished") {
      add(fromDeck, e.code);
      if (e.to === "GY") steps.push(`  → send ${nameOf(e.code)} from Deck to GY`);
    }
    else if (e.from === "Hand") handLeft.push(e.code);
    else if (e.from === "Extra" && e.to === "Field") extraUsed.push(e.code);
  }

  // which opening-hand cards were used (a searched copy leaving the hand doesn't count)
  const leftCount = new Map<number, number>();
  for (const c of handLeft) leftCount.set(c, (leftCount.get(c) ?? 0) + 1);
  const handUsed: number[] = [], handUnused: number[] = [];
  for (const c of hand) {
    const left = (leftCount.get(c) ?? 0) - (searched.get(c) ?? 0);
    const usedSoFar = handUsed.filter((x) => x === c).length;
    (left > usedSoFar ? handUsed : handUnused).push(c);
  }

  const endBoard: { code: number; zone: Zone }[] = [];
  for (const [k, n] of zones) {
    const [code, z] = k.split("|");
    if ((z === "Field" || z === "S/T") && n > 0) for (let j = 0; j < n; j++) endBoard.push({ code: Number(code), zone: z as Zone });
  }
  return { player: me, turn, handUsed, handUnused, fromDeck, searched, extraUsed, endBoard, steps };
}
