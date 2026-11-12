// Galaxy-Eyes pack: what "Nibiru-proof" means for this deck (user's definition, docs/KNOWLEDGE.md).
// Called with the player's side of the field at the moment of the 5th summon of the turn.
import { nameOf } from "../../packages/engine/core.mjs";

const LORD = "Number 90: Galaxy-Eyes Photon Lord", TACHYON = "Number 107: Galaxy-Eyes Tachyon Dragon", TRANSMIGRATION = "Tachyon Transmigration";

/** side: readSide() of player 0. Returns { proof, why }. */
export function nibiruProof(side) {
  const mons = side.monsters.filter((m) => m.pos & 5);
  if (mons.some((m) => nameOf(m.code) === LORD && m.mats.length > 0)) return { proof: true, why: "Photon Lord with material is on the field at summon 5" };
  const transmigration = side.hand.some((c) => nameOf(c) === TRANSMIGRATION) || side.st.some((x) => nameOf(x.code) === TRANSMIGRATION);
  if (mons.some((m) => nameOf(m.code) === TACHYON) && transmigration) return { proof: true, why: "Tachyon Dragon is on the field at summon 5, so Transmigration is live" };
  // shortcut: "forcing Nibiru on summon 5 because summon 6 builds a negate" is not detected, add when a drill hits it
  return { proof: false, why: "At summon 5: no Photon Lord, and no Tachyon Dragon with Transmigration" };
}
