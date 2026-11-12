// node sim/fixline.mjs <route> <cut> [width] [secs]: follow the user's replay for its first <cut> events, then let
// the engine find the best legal finish (for lines that relied on something illegal, e.g. Omega's Antimatter ruling).
import { readFileSync } from "fs";
import { followReplay } from "./follow2.mjs";
import { beamSolve } from "../beam.mjs";
import { id, mainList } from "../deck.mjs";
const L = JSON.parse(readFileSync(new URL("../../replays/learned.json", import.meta.url), "utf8"));
const [ri, cut, width = "40", secs = "120"] = process.argv.slice(2);
const R = L[Number(ri)];
const extra = Object.entries(R.extra).flatMap(([n, k]) => Array(k).fill(id(n)));
const FILL = ["Ash Blossom & Joyous Spring", "Infinite Impermanence", "Ash Blossom & Joyous Spring", "Infinite Impermanence"];
const hand = [...R.handUsed, ...FILL].slice(0, 5).map(id);
const deck = mainList(); for (const c of hand) deck.splice(deck.indexOf(c), 1);
const deck1 = Array(40).fill(id("Dark Magician"));
const f = followReplay({ hand, deck, extra, deck1, expected: R.events.slice(0, Number(cut)), stopAtEnd: true });
const r = beamSolve(hand, deck, { width: Number(width), extra, deck1, prefix: f.responses, timeLimitMs: Number(secs) * 1000 });
console.log(JSON.stringify({ route: R.file.split("/").pop(), cut: Number(cut), followed: `${f.matched}/${f.total}`, board: r.score?.value, parts: r.score?.parts.map((p) => p[0]), monsters: r.board?.monsters, backrow: r.board?.backrow, line: r.line?.slice?.(-25) }));
