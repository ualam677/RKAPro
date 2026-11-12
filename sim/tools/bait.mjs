// node sim/bait.mjs "<card A,card B,...>" "<hand trap>" "<lead regex>" [width] [secs]
// Our plan: the best uninterrupted line that starts with the given lead. The opponent fires the hand trap at the K-th
// legal window along that plan (K = 1..all); we respond (chain prompts: try each), then re-plan the rest.
// Worst board over K = how safe that lead is. Compare leads to find the right bait.
import { beamSolve } from "../beam.mjs";
import { id, mainList, extraList } from "../deck.mjs";
import { lib, newDuel, runUntilPrompt, nameOf } from "../engine.mjs";
import { choices, T } from "../choices.mjs";
const [handStr, htName, lead, width = "16", secs = "20"] = process.argv.slice(2);
const FILL = ["Ash Blossom & Joyous Spring", "Infinite Impermanence", "Ash Blossom & Joyous Spring", "Infinite Impermanence"];
const names = [...handStr.split(","), ...FILL].slice(0, 5);
const hand = names.map(id); const deck = mainList(); for (const c of hand) deck.splice(deck.indexOf(c), 1);
const extra = extraList(); const HT = id(htName); const deck1 = [HT, ...Array(39).fill(id("Dark Magician"))];
const lastAct = (log) => { for (let i = log.length - 1; i >= 0; i--) if (log[i].type === 70 && log[i].controller === 0) return log[i].code; return null; };
const mk = (k) => { const f = Object.assign((p, c, log) => { const st = f.state;
  if (st.fired && !st.targeted && st.hitCode) { const o = c.find((x) => x.code === st.hitCode || x.picks?.includes(st.hitCode)); if (o) { st.targeted = true; return o; } }
  const opt = c.find((o) => o.code === HT && /^(Chain|Activate|Yes)/.test(o.label));
  if (opt && !st.fired) { st.n++; if (st.n >= k) { st.fired = true; const la = lastAct(log ?? []); st.hitCode = la; st.hit = la ? nameOf(la) : "?"; return opt; } }
  return c.find((x) => x.pass) ?? c.find((x) => /^No/.test(x.label)) ?? c[0]; }, { state: { n: 0, fired: false } }); return f; };
// 1) the plan: force the lead, then best uninterrupted line
const leadRes_ = lead.split("||").map((x) => new RegExp(x));
const leadLabels = (() => { const h = newDuel({ deck0: [...hand, ...deck], extra0: extra, deck1, hand0: 5 }); const labs = [];
  for (let g = 0; g < 200 && labs.length < leadRes_.length; g++) { const r = runUntilPrompt(h, []); const c = choices(r.prompt);
    if (r.prompt.player !== 0) { lib.duelSetResponse(h, (c.find((x) => x.pass) ?? c[0]).res); continue; }
    if (c.length === 1) { lib.duelSetResponse(h, c[0].res); continue; }
    const o = c.find((x) => leadRes_[labs.length].test(x.label));
    if (!o) { const d = c.find((x) => /^Yes/.test(x.label)) ?? c.find((x) => x.pass) ?? c[0]; lib.duelSetResponse(h, d.res); continue; }
    labs.push(o.label); lib.duelSetResponse(h, o.res); }
  lib.destroyDuel(h); return labs; })();
const leadLabel = leadLabels[0];
import { readFileSync } from "fs";
const GUIDE = process.env.GUIDE ? JSON.parse(readFileSync(new URL("../../replays/learned.json", import.meta.url), "utf8"))[Number(process.env.GUIDE)].guide : undefined;
// replay a line given as option labels: multi-option prompts take the next label if offered, else default (take triggers, don't chain)
function walk(labels, it, stopWhenFired) {
  const h = newDuel({ deck0: [...hand, ...deck], extra0: extra, deck1: it ? deck1 : Array(40).fill(id("Dark Magician")), hand0: 5 }); const resps = []; let i = 0, out = null;
  for (let g = 0; g < 5000; g++) {
    const log = []; const r = runUntilPrompt(h, log); if (r.ended || log.some((m) => m.type === 40 && m.player === 1)) break;
    const c = choices(r.prompt);
    if (r.prompt.player !== 0) { lib.duelSetResponse(h, ((it ? it(r.prompt, c, log) : null) ?? c.find((x) => x.pass) ?? c[0]).res); continue; }
    if (stopWhenFired && it?.state.fired) { out = { prompt: r.prompt, opts: c }; break; }
    let o;
    if (c.length === 1) o = c[0];
    else if (i < labels.length && c.some((x) => x.label === labels[i])) { const want = labels[i++]; o = c.find((x) => x.label === want); }
    else if (i >= labels.length) break;
    else o = c.find((x) => /^Yes/.test(x.label)) ?? c.find((x) => x.pass) ?? c[0];
    lib.duelSetResponse(h, o.res); resps.push(o.res);
  }
  lib.destroyDuel(h); return { resps, out };
}
const leadPrefix = walk(leadLabels, null, false).resps;
const plan = beamSolve(hand, deck, { width: Number(width), extra, deck1: Array(40).fill(id("Dark Magician")), prefix: leadPrefix, guide: GUIDE, timeLimitMs: Number(secs) * 1000 * 2 });
const planLabels = [...leadLabels, ...(plan.line ?? [])];
console.log(JSON.stringify({ hand: handStr, lead, ht: htName, uninterrupted: plan.score?.value, plan: process.env.PLAN ? planLabels : undefined }));
// 2) replay the plan with the hand trap firing at window k; stop at the first prompt of ours after it fires
function replayTo(k) { const it = mk(k); const { resps, out } = walk(planLabels, it, true); return { it, resps, out }; }
const worst = { board: Infinity };
for (let k = 1; k < 40; k++) {
  const { it, resps, out } = replayTo(k);
  if (!it.state.fired) break; // no more windows along the plan
  const opts = out?.prompt.type === T.CHAIN ? out.opts : [null]; // at an idle prompt the search covers every option itself
  let best = { value: -1 }, how = "";
  for (const o of opts) {
    const x = beamSolve(hand, deck, { width: Number(width), extra, deck1, interrupt: mk(k), prefix: o ? [...resps, o.res] : resps, timeLimitMs: Number(secs) * 1000 });
    if ((x.value ?? -1) > best.value) { best = x; how = o?.label ?? ""; }
  }
  const b = best.score?.value ?? 0;
  console.log(JSON.stringify({ k, hit: it.state.hit, response: how, board: b, monsters: best.board?.monsters, backrow: best.board?.backrow }));
  if (b < worst.board) Object.assign(worst, { board: b, k, hit: it.state.hit });
}
console.log(JSON.stringify({ lead, worst }));
