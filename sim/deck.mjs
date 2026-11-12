// The deck the tools use, read from the pack. MAIN/EXTRA: the user's current list. REPLAY_MAIN: the list the 5 replays were recorded on.
import { names } from "./engine.mjs";
import pack from "../packs/galaxy-eyes/deck.json" with { type: "json" };
const byName = new Map(); for (const [id, n] of names) if (!byName.has(n)) byName.set(n, id);
export const id = (n) => { const x = byName.get(n); if (!x) throw new Error("no card " + n); return x; };
export const MAIN = pack.main, REPLAY_MAIN = pack.replayMain, EXTRA = pack.extra;
export const mainList = (m = MAIN) => Object.entries(m).flatMap(([n, k]) => Array(k).fill(id(n)));
export const extraList = () => EXTRA.map(id);
// Route tools replay the recorded lines, so they use the recorded list. NEWLIST=1 tries the same line on the current list.
export const replayMain = () => mainList(process.env.NEWLIST ? MAIN : REPLAY_MAIN);
