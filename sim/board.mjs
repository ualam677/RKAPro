// Read the board and score it.
import { lib, nameOf, cards } from "./engine.mjs";

const F = { CODE: 1, POSITION: 2, TYPE: 8, RANK: 32, ATTACK: 256, OVERLAY: 65536 };
const L = { DECK: 1, HAND: 2, MZONE: 4, SZONE: 8, GRAVE: 16, REMOVED: 32, EXTRA: 64 };

export function readSide(h, p = 0) {
  const q = (loc, flags = F.CODE) => (lib.duelQueryLocation(h, { flags, controller: p, location: loc }) ?? []).filter(Boolean);
  return {
    hand: q(L.HAND).map((c) => c.code),
    monsters: q(L.MZONE, F.CODE | F.POSITION | F.OVERLAY | F.ATTACK).map((c) => ({ code: c.code, pos: c.position, mats: c.overlayCards ?? [], atk: c.attack })),
    st: q(L.SZONE, F.CODE | F.POSITION).map((c) => ({ code: c.code, pos: c.position })),
    grave: q(L.GRAVE).map((c) => c.code),
    banished: q(L.REMOVED).map((c) => c.code),
    extra: q(L.EXTRA).map((c) => c.code),
    deckCount: lib.duelQueryCount(h, p, L.DECK),
    emz: (lib.duelQueryLocation(h, { flags: F.CODE, controller: p, location: L.MZONE }) ?? []).slice(5, 7).map((c) => c?.code ?? 0),
  };
}

/** Canonical key of the visible state (for the transposition table). */
export function stateKey(s) {
  const srt = (a) => [...a].sort((x, y) => x - y).join(".");
  return [srt(s.hand), s.monsters.map((m) => `${m.code}:${srt(m.mats)}`).sort().join("|"), s.st.map((x) => `${x.code}:${x.pos}`).sort().join("|"), srt(s.grave), srt(s.banished), srt(s.extra), s.deckCount, (s.emz ?? []).join(".")].join("#");
}

const nm = (c) => nameOf(c);
const isXyz = (c) => (cards.get(c)?.type ?? 0) & 0x800000;
const rankOf = (c) => cards.get(c)?.level ?? 0;
const hasSet = (c, set) => (cards.get(c)?.setcodes ?? []).includes(set);
const SET_GALAXY = 0x7b, SET_PHOTON = 0x55, SET_GALAXYEYES = 0x107b;

export const HAND_TRAPS = new Set(["Ash Blossom & Joyous Spring", "Mulcharmy Fuwalos", "Ghost Ogre & Snow Rabbit", "Infinite Impermanence",
  "Effect Veiler", "Droll & Lock Bird", "Mulcharmy Purulia", "Nibiru, the Primal Being", "Dominus Spark", "Dominus Purge", "Dominus Impulse"]);

/**
 * Interruptions your board gives on the opponent's turn. Returns { value, parts }.
 * Hand traps still in hand are counted separately (handTraps).
 */
export function scoreBoard(s) {
  const parts = [];
  const mons = s.monsters.filter((m) => m.pos & 5); // face-up
  const names = mons.map((m) => nm(m.code));
  const has = (n) => names.includes(n);
  const galaxyEyes = mons.some((m) => hasSet(m.code, SET_GALAXYEYES) || /Galaxy-Eyes/.test(nm(m.code)));
  const xyzs = mons.filter((m) => isXyz(m.code));
  for (const m of mons) {
    const n = nm(m.code);
    if (n === "Number 90: Galaxy-Eyes Photon Lord" && m.mats.length) parts.push(["Photon Lord (monster negate + search)", 1.25]);
    if (n === "Number 38: Hope Harbinger Dragon Titanic Galaxy") parts.push(["Hope Harbinger (spell negate)", 1]);
    if (n === "Neo Galaxy-Eyes Photon Dragon - Photon Howling" && m.mats.length >= 3 && xyzs.length >= 2 && !parts.some((p) => p[0].startsWith("Photon Howling"))) parts.push(["Photon Howling (board negate)", 1]);
    if (n === "Starliege Photon Blast Dragon" && m.mats.length) parts.push(["Photon Blast (protection)", 0.5]);
  }
  const tt = s.st.some((x) => nm(x.code) === "Tachyon Transmigration") || (s.hand.some((c) => nm(c) === "Tachyon Transmigration") && has("Number 107: Galaxy-Eyes Tachyon Dragon"));
  if (tt && galaxyEyes) parts.push(["Tachyon Transmigration (omni negate)", 1]);
  const eg = s.st.some((x) => nm(x.code) === "Eternal Galaxy");
  if (eg) {
    const r4 = xyzs.some((m) => rankOf(m.code) === 4 && (hasSet(m.code, SET_GALAXY) || hasSet(m.code, SET_PHOTON) || /Galaxy|Photon/.test(nm(m.code))));
    const lordLeft = s.extra.some((c) => nm(c) === "Number 90: Galaxy-Eyes Photon Lord");
    const harbLeft = s.extra.some((c) => nm(c) === "Number 38: Hope Harbinger Dragon Titanic Galaxy");
    if (r4 && (lordLeft || harbLeft)) parts.push([`Eternal Galaxy → ${lordLeft ? "Photon Lord" : "Harbinger"} on their turn`, 1]);
  }
  const handTraps = s.hand.filter((c) => HAND_TRAPS.has(nm(c))).length;
  const value = parts.reduce((a, [, v]) => a + v, 0);
  return { value, parts, handTraps, follow: s.hand.length };
}

export const describeBoard = (s) => ({
  monsters: s.monsters.map((m) => `${nm(m.code)}${m.mats.length ? ` [${m.mats.length}]` : ""}`),
  backrow: s.st.map((x) => nm(x.code)),
  hand: s.hand.map(nm),
});
