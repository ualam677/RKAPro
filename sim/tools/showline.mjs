import { readFileSync } from "fs";
import { beamSolve } from "../beam.mjs";
import { id, replayMain } from "../deck.mjs";
const L = JSON.parse(readFileSync(new URL("../../replays/learned.json", import.meta.url), "utf8"));
const [ri, k] = process.argv.slice(2).map(Number);
const R = L[ri];
const extra = Object.entries(R.extra).flatMap(([n, c]) => Array(c).fill(id(n)));
const hand = [...R.handUsed, "Ash Blossom & Joyous Spring", "Infinite Impermanence", "Ash Blossom & Joyous Spring", "Infinite Impermanence"].slice(0, 5).map(id);
const deck = replayMain(); for (const c of hand) deck.splice(deck.indexOf(c), 1);
const NIB = id("Nibiru, the Primal Being"), DM = id("Dark Magician");
let summons = 0;
const f = Object.assign((p, c, log) => {
  const opt = c.find((o) => o.code === NIB && /^(Chain|Activate|Yes)/.test(o.label));
  if (opt && !f.state.fired) { f.state.n++; if (f.state.n >= k) { f.state.fired = true; return opt; } }
  return c.find((x) => x.pass) ?? c[0]; }, { state: { n: 0, fired: false } });
const r = beamSolve(hand, deck, { width: 30, extra, guide: R.guide, interrupt: f, deck1: [NIB, ...Array(39).fill(DM)], timeLimitMs: 60000 });
console.log(`board ${r.score.value}: ${r.score.parts.map((p) => p[0]).join(" · ")}`);
console.log("end:", r.board.monsters.join(", "), "|", r.board.backrow.join(", "));
console.log((r.line ?? []).filter((l) => /^(Normal Summon|Special Summon|Activate|Chain|Yes:|Set|Pick|Select)/.test(l)).join("\n"));
