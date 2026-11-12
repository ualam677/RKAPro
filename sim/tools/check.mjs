// Targeted engine checks on the user's replay lines.
//   node sim/check.mjs <route 0-4> <mode: plain | nib:K> [width] [timeLimitSec]
import { readFileSync } from "fs";
import { beamSolve, tokens, lcs } from "../beam.mjs";
import { id, replayMain } from "../deck.mjs";
const L = JSON.parse(readFileSync(new URL("../../replays/learned.json", import.meta.url), "utf8"));
const [ri, mode = "plain", width = "30", tl = "60"] = process.argv.slice(2);
const R = L[Number(ri)];
const extra = Object.entries(R.extra).flatMap(([n, k]) => Array(k).fill(id(n)));
const FILL = ["Ash Blossom & Joyous Spring", "Infinite Impermanence", "Ash Blossom & Joyous Spring", "Infinite Impermanence"];
const handNames = [...R.handUsed, ...FILL].slice(0, 5);
const hand = handNames.map(id); const deck = replayMain(); for (const c of hand) deck.splice(deck.indexOf(c), 1);
const NIB = id("Nibiru, the Primal Being"), DM = id("Dark Magician");
let interrupt, deck1;
if (mode.startsWith("nib:")) {
  const k = Number(mode.slice(4));
  deck1 = [NIB, ...Array(39).fill(DM)];
  interrupt = Object.assign((p, c) => {
    const opt = c.find((o) => o.code === NIB && /^(Chain|Activate|Yes)/.test(o.label));
    if (opt && !interrupt.state.fired) { interrupt.state.n++; if (interrupt.state.n >= k) { interrupt.state.fired = true; return opt; } }
    return c.find((x) => x.pass) ?? c[0];
  }, { state: { n: 0, fired: false } });
}
const r = beamSolve(hand, deck, { width: Number(width), extra, guide: R.guide, interrupt, deck1, timeLimitMs: Number(tl) * 1000 });
const follow = r.line ? lcs(tokens(r.line), R.guide) : 0;
console.log(JSON.stringify({ route: R.file.split("/").pop(), mode, board: r.score?.value ?? 0, parts: r.score?.parts.map((p) => p[0]) ?? [], ht: r.score?.handTraps,
  monsters: r.board?.monsters, backrow: r.board?.backrow, nib: r.istate, follow: `${follow}/${R.guide.length}`, secs: +(r.ms / 1000).toFixed(1), nodes: r.nodes }));
