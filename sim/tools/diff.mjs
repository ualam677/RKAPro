// node sim/diff.mjs <route>: follow the replay, then re-run the chosen responses and print engine events next to the replay's
import { readFileSync } from "fs";
import { followReplay, events } from "./follow2.mjs";
import { id, mainList } from "../deck.mjs";
import { lib, newDuel, runUntilPrompt } from "../engine.mjs";
import { choices, setZoneBranching } from "../choices.mjs";
const L = JSON.parse(readFileSync(new URL("../../replays/learned.json", import.meta.url), "utf8"));
const R = L[Number(process.argv[2])];
const extra = Object.entries(R.extra).flatMap(([n, k]) => Array(k).fill(id(n)));
const FILL = ["Ash Blossom & Joyous Spring", "Infinite Impermanence", "Ash Blossom & Joyous Spring", "Infinite Impermanence"];
const hand = [...R.handUsed, ...FILL].slice(0, 5).map(id);
const deck = mainList(); for (const c of hand) deck.splice(deck.indexOf(c), 1);
const DM = id("Dark Magician"); const deck1 = Array(40).fill(DM);
const f = followReplay({ hand, deck, extra, deck1, expected: R.events });
console.error("board", JSON.stringify(f.board));
setZoneBranching(true);
const h = newDuel({ deck0: [...hand, ...deck], extra0: extra, deck1, hand0: hand.length });
const log = []; let i = 0;
for (let g = 0; g < 3000; g++) { const r = runUntilPrompt(h, log); if (r.ended) break; if (log.some((m) => m.type === 40 && m.player === 1)) break;
  const c = choices(r.prompt); if (r.prompt.player !== 0) { lib.duelSetResponse(h, (c.find((x) => x.pass) ?? c[0]).res); continue; }
  if (i >= f.responses.length) break; lib.duelSetResponse(h, f.responses[i++]); }
const ALL = !!process.env.ALL; const got = events(log).filter((e) => ALL || !(e.kind === "move" && e.from === "Material" && e.to === "Material"));
const fmt = (e) => e ? `${e.kind[0]}:${e.name}${e.from ? " " + e.from + ">" + (e.to ?? "") : ""}` : "";
const exp = R.events.filter((e) => ALL || !(e.kind === "move" && e.from === "Material" && e.to === "Material"));
const [a, b] = (process.argv[3] ?? "0-200").split("-").map(Number);
for (let k = a; k < Math.min(b, Math.max(exp.length, got.length)); k++) console.log(String(k).padStart(3), fmt(exp[k]).padEnd(60), "|", fmt(got[k]));
