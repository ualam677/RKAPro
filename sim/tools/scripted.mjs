// node sim/scripted.mjs "<hand,comma,sep>" "<regex1>|<regex2>..." [guideRoute] [secs]: pick options matching the given label
// regexes in order (one per multi-option prompt), then beam-search the rest. A quick way to test "I'd start like this".
import { readFileSync } from "fs";
import { beamSolve } from "../beam.mjs";
import { id, mainList, extraList } from "../deck.mjs";
import { lib, newDuel, runUntilPrompt } from "../engine.mjs";
import { choices } from "../choices.mjs";
const L = JSON.parse(readFileSync(new URL("../../replays/learned.json", import.meta.url), "utf8"));
const [handStr, steps, g, secs = "90"] = process.argv.slice(2);
const FILL = ["Ash Blossom & Joyous Spring", "Infinite Impermanence", "Ash Blossom & Joyous Spring", "Infinite Impermanence"];
const names = [...handStr.split(","), ...FILL].slice(0, 5);
const hand = names.map(id); const deck = mainList(); for (const c of hand) deck.splice(deck.indexOf(c), 1);
const res = steps.split("||").map((s) => new RegExp(s));
const h = newDuel({ deck0: [...hand, ...deck], extra0: extraList(), deck1: Array(40).fill(id("Dark Magician")), hand0: 5 });
const prefix = []; let i = 0;
for (let n = 0; n < 500 && i < res.length; n++) {
  const r = runUntilPrompt(h, []); if (r.ended) break;
  const c = choices(r.prompt);
  if (r.prompt.player !== 0) { lib.duelSetResponse(h, (c.find((x) => x.pass) ?? c[0]).res); continue; }
  if (c.length === 1) { lib.duelSetResponse(h, c[0].res); prefix.push(c[0].res); continue; }
  const o = c.find((x) => res[i].test(x.label));
  if (!o) { console.error("no option matching", res[i], "in", c.map((x) => x.label)); break; }
  lib.duelSetResponse(h, o.res); prefix.push(o.res); i++;
}
lib.destroyDuel(h);
const r = beamSolve(hand, deck, { width: 30, prefix, guide: g ? L[Number(g)].guide : undefined, timeLimitMs: Number(secs) * 1000 });
console.log(JSON.stringify({ hand: handStr, board: r.value, parts: r.score?.parts.map((p) => p[0]), monsters: r.board?.monsters, backrow: r.board?.backrow }));
