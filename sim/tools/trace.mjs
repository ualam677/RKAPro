// node sim/trace.mjs <route>  — follow the replay, then re-run the chosen responses and print engine events vs replay
import { readFileSync } from "fs";
import { followReplay, events } from "./follow2.mjs";
import { id, mainList } from "../deck.mjs";
import { lib, newDuel, runUntilPrompt } from "../engine.mjs";
import { choices } from "../choices.mjs";
const L = JSON.parse(readFileSync(new URL("../../replays/learned.json", import.meta.url), "utf8"));
const R = L[Number(process.argv[2])];
const extra = Object.entries(R.extra).flatMap(([n, k]) => Array(k).fill(id(n)));
const FILL = ["Ash Blossom & Joyous Spring", "Infinite Impermanence", "Ash Blossom & Joyous Spring", "Infinite Impermanence"];
const hand = [...R.handUsed, ...FILL].slice(0, 5).map(id);
const deck = mainList(); for (const c of hand) deck.splice(deck.indexOf(c), 1);
const DM = id("Dark Magician");
const f = followReplay({ hand, deck, extra, deck1: Array(40).fill(DM), expected: R.events, B: Number(process.argv[3] ?? 12) });
console.log("matched", f.matched, "/", f.total);
const h = newDuel({ deck0: [...hand, ...deck], extra0: extra, deck1: Array(40).fill(DM), hand0: hand.length });
let i = 0;
for (let g = 0; g < 2000; g++) {
  const log = []; const r = runUntilPrompt(h, log);
  for (const e of events(log)) console.log("   ", e.kind[0], e.name, e.from ? e.from + ">" + (e.to ?? "") : "");
  if (r.ended || i >= f.responses.length) break;
  const c = choices(r.prompt);
  if (r.prompt.player !== 0) { lib.duelSetResponse(h, (c.find((x) => x.pass) ?? c[0]).res); continue; }
  const res = f.responses[i++]; const o = c.find((x) => JSON.stringify(x.res) === JSON.stringify(res));
  if (c.length > 1) console.log("> " + (o?.label ?? "?") + "   [of " + c.length + "]");
  lib.duelSetResponse(h, res);
}
