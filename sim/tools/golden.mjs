// node tools/golden.mjs [route...]   (YGO_OMEGA_RULINGS=1 for route 3)
// Follow a recorded line, then write the FULL action log (both players' responses) through the library API
// as a golden fixture: packs/galaxy-eyes/golden/<n>.json. `npm test` replays these in seconds.
import { readFileSync, writeFileSync } from "fs";
import { followReplay } from "./follow2.mjs";
import { id, replayMain } from "../deck.mjs";
import { scoreBoard, describeBoard } from "../board.mjs";
import { createDuel, logToJSON } from "../../packages/engine/api.mjs";
const L = JSON.parse(readFileSync(new URL("../../replays/learned.json", import.meta.url), "utf8"));
const FILL = ["Ash Blossom & Joyous Spring", "Infinite Impermanence", "Ash Blossom & Joyous Spring", "Infinite Impermanence"];
for (const ri of process.argv.slice(2).map(Number)) {
  const R = L[ri];
  const extra = Object.entries(R.extra).flatMap(([n, k]) => Array(k).fill(id(n)));
  const hand = [...R.handUsed, ...FILL].slice(0, 5).map(id);
  const deck = replayMain(); for (const c of hand) deck.splice(deck.indexOf(c), 1);
  const deck1 = Array(40).fill(id("Dark Magician"));
  const f = followReplay({ hand, deck, extra, deck1, expected: R.events });
  if (f.matched !== f.total) { console.error(`route ${ri}: followed ${f.matched}/${f.total}, no fixture written`); process.exitCode = 1; continue; }
  const d = createDuel({ deck0: [...hand, ...deck], extra0: extra, deck1, hand0: hand.length });
  let i = 0;
  while (d.prompt && !d.messages.some((m) => m.type === 40 && m.player === 1)) {
    const c = d.options();
    if (d.prompt.player !== 0) d.respond((c.find((x) => x.pass) ?? c[0]).res);
    else if (i < f.responses.length) d.respond(f.responses[i++]);
    else d.respond((c.find((x) => /^Set (Eternal Galaxy|Tachyon Transmigration)/.test(x.label)) ?? c.find((x) => x.pass || x.end) ?? c.find((x) => /^No/.test(x.label)) ?? c[0]).res);
  }
  const side = d.side(0); d.destroy();
  const out = { route: ri, file: R.file.split("/").pop(), omegaRulings: !!process.env.YGO_OMEGA_RULINGS, log: JSON.parse(logToJSON(d.actionLog())), expect: { board: scoreBoard(side).value, ...describeBoard(side) } };
  writeFileSync(new URL(`../../packs/galaxy-eyes/golden/${ri}.json`, import.meta.url), JSON.stringify(out) + "\n");
  console.log(`route ${ri}: ${d.responses.length} responses, board ${out.expect.board}`);
}
