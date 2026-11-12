// node sim/ht.mjs <route 0-4> <hand trap name> [width] [secs]
// Opponent holds one hand trap and fires it at the K-th window where it is legal (K = 1..all) along the user's exact line.
// At that point we try every response, then search the best finish. Prints what got hit and the board left, per K.
import { readFileSync } from "fs";
import { followReplay } from "./follow2.mjs";
import { beamSolve } from "../beam.mjs";
import { id, mainList } from "../deck.mjs";
import { lib, newDuel, runUntilPrompt, nameOf } from "../engine.mjs";
import { choices } from "../choices.mjs";
const L = JSON.parse(readFileSync(new URL("../../replays/learned.json", import.meta.url), "utf8"));
const [ri, htName, width = "12", secs = "15", only] = process.argv.slice(2);
const R = L[Number(ri)];
const extra = Object.entries(R.extra).flatMap(([n, k]) => Array(k).fill(id(n)));
const FILL = ["Ash Blossom & Joyous Spring", "Infinite Impermanence", "Ash Blossom & Joyous Spring", "Infinite Impermanence"];
const hand = [...R.handUsed, ...FILL].slice(0, 5).map(id);
const deck = mainList(); for (const c of hand) deck.splice(deck.indexOf(c), 1);
const HT = id(htName), DM = id("Dark Magician");
const deck1 = [HT, ...Array(39).fill(DM)];
const lastAct = (log) => { for (let i = log.length - 1; i >= 0; i--) if (log[i].type === 70 && log[i].controller === 0) return log[i].code; return null; };
// fire at the k-th window (k = Infinity: never fire, just count windows); target = the card whose effect was just activated
const mk = (k) => { const f = Object.assign((p, c, log) => {
  const st = f.state;
  if (st.fired && !st.targeted) { // follow-up selection (Imperm/Veiler target, Ogre target...)
    const want = st.hitCode; const o = c.find((x) => x.code === want || x.picks?.includes(want));
    if (o) { st.targeted = true; return o; }
  }
  const opt = c.find((o) => o.code === HT && /^(Chain|Activate|Yes)/.test(o.label));
  if (opt && !st.fired) { st.n++; const la = lastAct(log); if (st.n >= k) { st.fired = true; st.hitCode = la; st.hit = la ? nameOf(la) : "?"; return opt; } }
  return c.find((x) => x.pass) ?? c.find((x) => /^No/.test(x.label)) ?? c[0]; }, { state: { n: 0, fired: false } }); return f; };
// 1) count the windows along the exact line
const count = mk(Infinity); followReplay({ hand, deck, extra, deck1, expected: R.events, interrupt: count });
const N = count.state.n;
console.error(`${R.file.split("/").pop()} vs ${htName}: ${N} windows`);
for (let k = 1; k <= N; k++) {
  if (only && !only.split(",").map(Number).includes(k)) continue;
  const it = mk(k);
  const f = followReplay({ hand, deck, extra, deck1, expected: R.events, interrupt: it, stopWhenFired: true });
  if (f.firedAt === null) { console.log(JSON.stringify({ k, note: "not fired" })); continue; }
  const hit = it.state.hit;
  // options at the moment the hand trap activates (e.g. chain Transmigration)
  const optsAt = (() => {
    const h = newDuel({ deck0: [...hand, ...deck], extra0: extra, deck1, hand0: hand.length }); const i2 = mk(k); let i = 0, out = [];
    for (let g = 0; g < 5000; g++) {
      const log = []; const rr = runUntilPrompt(h, log); if (rr.ended) break;
      const p = rr.prompt; const c = choices(p);
      if (p.player !== 0) { lib.duelSetResponse(h, (i2(p, c, log) ?? c[0]).res); continue; }
      if (i < f.responses.length) { lib.duelSetResponse(h, f.responses[i++]); continue; }
      out = c; break;
    }
    lib.destroyDuel(h); return out;
  })();
  let r = { value: -1 }, how = "";
  const resp = optsAt.filter((o) => !o.end);
  for (const o of resp.length ? resp : [null]) {
    const x = beamSolve(hand, deck, { width: Number(width), extra, deck1, interrupt: mk(k), prefix: o ? [...f.responses, o.res] : f.responses, timeLimitMs: Number(secs) * 1000, guide: R.guide });
    if (process.env.OPTS) console.error("  opt", o?.label, "->", x.value?.toFixed?.(2), JSON.stringify(x.istate));
    if ((x.value ?? -1) > r.value) { r = x; how = o?.label ?? ""; }
  }
  console.log(JSON.stringify({ k, hit, at: `${f.matched}/${f.total}`, response: how, board: r.score?.value ?? 0, line: process.env.LINE ? r.line : undefined, parts: r.score?.parts.map((p) => p[0]), monsters: r.board?.monsters, backrow: r.board?.backrow }));
}
