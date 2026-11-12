// MAIN/EXTRA: the user's current list (decks/current.md, 12 Nov 2026). REPLAY_MAIN: the list the 5 replays were recorded on.
import { names } from "./engine.mjs";
const byName = new Map(); for (const [id, n] of names) if (!byName.has(n)) byName.set(n, id);
export const id = (n) => { const x = byName.get(n); if (!x) throw new Error("no card " + n); return x; };
export const REPLAY_MAIN = {
  "Photon Delta Wing": 3, "Galaxy Soldier": 3, "Schwarzschild Infinity Dragon": 3, "Galaxy Defense Robot Orbital 7": 3,
  "Galaxy Wizard": 1, "Photon Thrasher": 1, "Galaxy War Drake": 1, "Seventh Tachyon": 3, "Pot of Prosperity": 1,
  "Mulcharmy Fuwalos": 3, "Ash Blossom & Joyous Spring": 3, "Ghost Ogre & Snow Rabbit": 3, "Infinite Impermanence": 3,
  "Effect Veiler": 3, "Droll & Lock Bird": 1, "Galaxy-Eyes Photon Dragon": 1, "Galaxy-Eyes Tachyon Primal": 1,
  "Galaxy-Eyes Afterglow Dragon": 1, "Photon Emperor": 1, "Photon Orbital": 1, "Galaxy Summoner": 1,
  "Tachyon Transmigration": 1, "Eternal Galaxy": 1,
};
export const MAIN = {
  "Photon Delta Wing": 3, "Galaxy Soldier": 3, "Schwarzschild Infinity Dragon": 3, "Galaxy Defense Robot Orbital 7": 3,
  "Galaxy Wizard": 2, "Galaxy War Drake": 1, "Seventh Tachyon": 3,
  "Mulcharmy Fuwalos": 3, "Ash Blossom & Joyous Spring": 3, "Ghost Ogre & Snow Rabbit": 3, "Infinite Impermanence": 3,
  "Effect Veiler": 3, "Droll & Lock Bird": 1, "Galaxy-Eyes Photon Dragon": 1, "Galaxy-Eyes Tachyon Primal": 1,
  "Galaxy-Eyes Afterglow Dragon": 1, "Photon Emperor": 1, "Photon Orbital": 1, "Galaxy Summoner": 1,
  "Tachyon Transmigration": 2, "Eternal Galaxy": 1,
};
export const EXTRA = [
  "Galaxy-Eyes Cipher X Dragon", "Neo Galaxy-Eyes Photon Dragon - Photon Howling", "Neo Galaxy-Eyes Photon Dragon - Photon Howling",
  "Galaxy-Eyes Full Armor Photon Dragon", "Galaxy-Eyes Cipher Dragon", "Number 62: Galaxy-Eyes Prime Photon Dragon", "Number 107: Galaxy-Eyes Tachyon Dragon",
  "Number 38: Hope Harbinger Dragon Titanic Galaxy", "Divine Golden Shadow Dragon Dragluxion", "Number 90: Galaxy-Eyes Photon Lord",
  "Dark Ceruvim Irisfil", "Number 104: Masquerade Vain", "Galaxy Photon Dragon", "Starliege Photon Blast Dragon", "Galaxy-Eyes Antimatter Dragon",
];
export const mainList = (m = MAIN) => Object.entries(m).flatMap(([n, k]) => Array(k).fill(id(n)));
export const extraList = () => EXTRA.map(id);
// Route tools replay the recorded lines, so they use the recorded list. NEWLIST=1 tries the same line on the current list.
export const replayMain = () => mainList(process.env.NEWLIST ? MAIN : REPLAY_MAIN);
