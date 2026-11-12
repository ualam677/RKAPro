// Sample hands the odds model calls bricks (weighted by probability) and let the engine try them.
import { MAIN } from "../deck.mjs";
import { evalHand } from "./odds.mjs";
import { writeFileSync } from "fs";
const deck = []; for (const [k, c] of Object.entries(MAIN)) for (let i = 0; i < c; i++) deck.push(k);
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const out = [], seen = new Set();
for (let t = 0; t < 20000 && out.length < 14; t++) {
  const d = [...deck]; const hand = []; for (let i = 0; i < 5; i++) hand.push(d.splice(Math.floor(rnd() * d.length), 1)[0]);
  const h = {}; for (const x of hand) h[x] = (h[x] ?? 0) + 1;
  if (h["Pot of Prosperity"]) continue;
  if (evalHand(h)) continue;
  const eng = hand.filter((x) => !/Ash|Impermanence|Veiler|Ogre|Fuwalos|Droll/.test(x)).sort();
  const key = eng.join("+"); if (!eng.length || seen.has(key)) continue; seen.add(key);
  out.push({ name: hand.join(" + "), cards: hand, guide: null });
}
writeFileSync("out/bricks.json", JSON.stringify(out, null, 1)); console.log(out.map((o) => o.name).join("\n"));
