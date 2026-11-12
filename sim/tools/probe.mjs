// node sim/probe.mjs <route> <labelSubstring> [nth]  — follow replay; at the nth prompt whose chosen label contains substring, try every option and print events
import { readFileSync } from "fs";
import { followReplay, events } from "./follow2.mjs";
import { id, mainList } from "../deck.mjs";
import { lib, newDuel, runUntilPrompt } from "../engine.mjs";
import { choices } from "../choices.mjs";
import { save, restore } from "../state.mjs";
const L = JSON.parse(readFileSync(new URL("../../replays/learned.json", import.meta.url), "utf8"));
const [ri, sub, nth = "1"] = process.argv.slice(2);
const R = L[Number(ri)];
const extra = Object.entries(R.extra).flatMap(([n, k]) => Array(k).fill(id(n)));
const FILL = ["Ash Blossom & Joyous Spring", "Infinite Impermanence", "Ash Blossom & Joyous Spring", "Infinite Impermanence"];
const hand = [...R.handUsed, ...FILL].slice(0, 5).map(id);
const deck = mainList(); for (const c of hand) deck.splice(deck.indexOf(c), 1);
const DM = id("Dark Magician");
const f = followReplay({ hand, deck, extra, deck1: Array(40).fill(DM), expected: R.events });
const h = newDuel({ deck0: [...hand, ...deck], extra0: extra, deck1: Array(40).fill(DM), hand0: hand.length });
let i = 0, hit = 0;
const pass = (r) => { const c = choices(r.prompt); return (c.find((x) => x.pass) ?? c[0]).res; };
for (let g = 0; g < 2000; g++) {
  const r = runUntilPrompt(h, []);
  if (r.ended || i >= f.responses.length) break;
  const c = choices(r.prompt);
  if (r.prompt.player !== 0) { lib.duelSetResponse(h, pass(r)); continue; }
  const res = f.responses[i++]; const o = c.find((x) => JSON.stringify(x.res) === JSON.stringify(res));
  if (o?.label.includes(sub) && ++hit === Number(nth)) {
    const s = save();
    for (const alt of c) {
      restore(s); lib.duelSetResponse(h, alt.res);
      const out = [];
      for (let k = 0; k < 12; k++) { const log = []; const rr = runUntilPrompt(h, log); out.push(...events(log).map((e) => `${e.kind[0]}:${e.name}${e.from ? " " + e.from + ">" + (e.to ?? "") : ""}`)); if (rr.ended) break;
        const cc = choices(rr.prompt); out.push(`[prompt p${rr.prompt.player}: ${cc.map((x) => x.label).join(" / ")}]`);
        if (rr.prompt.player !== 0 || cc.length === 1) { lib.duelSetResponse(h, (cc.find((x) => x.pass) ?? cc[0]).res); continue; } break; }
      console.log("OPTION", alt.label, "\n   ", out.join("\n    "));
    }
    break;
  }
  lib.duelSetResponse(h, res);
}
