// Read the board (deck-agnostic). Scoring lives in the deck pack.
import { lib, nameOf } from "./core.mjs";

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
export const describeBoard = (s) => ({
  monsters: s.monsters.map((m) => `${nm(m.code)}${m.mats.length ? ` [${m.mats.length}]` : ""}`),
  backrow: s.st.map((x) => nm(x.code)),
  hand: s.hand.map(nm),
});
