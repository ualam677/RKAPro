// node sim/check2.mjs <route 0-4> <plain | nib:K> [width]
import { readFileSync } from "fs";
import { followReplay } from "./follow2.mjs";
import { beamSolve } from "../beam.mjs";
import { id, replayMain, extraList } from "../deck.mjs";
import { lib, newDuel, runUntilPrompt } from "../engine.mjs";
import { choices } from "../choices.mjs";
const L = JSON.parse(readFileSync(new URL("../../replays/learned.json", import.meta.url), "utf8"));
const [ri, mode = "plain", width = "30"] = process.argv.slice(2);
let R = L[Number(ri)];
// NEWLIST=1: same line on the current list. S38 left the Extra Deck; Dragluxion attaches Number 62 instead (verified, route 4).
if (process.env.NEWLIST) R = JSON.parse(JSON.stringify(R).replaceAll(String(id("Number S38: Titanic Galaxy")), String(id("Number 62: Galaxy-Eyes Prime Photon Dragon"))).replaceAll("Number S38: Titanic Galaxy", "Number 62: Galaxy-Eyes Prime Photon Dragon"));
const extra = process.env.NEWLIST ? extraList() : Object.entries(R.extra).flatMap(([n, k]) => Array(k).fill(id(n)));
const FILL = ["Ash Blossom & Joyous Spring", "Infinite Impermanence", "Ash Blossom & Joyous Spring", "Infinite Impermanence"];
const hand = [...R.handUsed, ...FILL].slice(0, 5).map(id);
const deck = replayMain(); for (const c of hand) deck.splice(deck.indexOf(c), 1);
const NIB = id("Nibiru, the Primal Being"), DM = id("Dark Magician");
const mkNib = (k) => { const f = Object.assign((p, c) => {
  const opt = c.find((o) => o.code === NIB && /^(Chain|Activate|Yes)/.test(o.label));
  if (opt && !f.state.fired) { f.state.n++; if (f.state.n >= k) { f.state.fired = true; return opt; } }
  return c.find((x) => x.pass) ?? c[0]; }, { state: { n: 0, fired: false } }); return f; };
const out = { route: R.file.split("/").pop(), mode };
if (mode === "plain") {
  const f = followReplay({ hand, deck, extra, deck1: Array(40).fill(DM), expected: R.events });
  Object.assign(out, { followed: `${f.matched}/${f.total}`, board: f.score.value, parts: f.score.parts.map((p) => p[0]), monsters: f.board.monsters, backrow: f.board.backrow });
} else {
  const k = Number(mode.slice(4)); const deck1 = [NIB, ...Array(39).fill(DM)];
  const f = followReplay({ hand, deck, extra, deck1, expected: R.events, interrupt: mkNib(k), stopWhenFired: true });
  if (f.firedAt === null) Object.assign(out, { note: "Nibiru never became live along the line (or line ended first)", followed: `${f.matched}/${f.total}`, board: f.score.value, monsters: f.board.monsters, backrow: f.board.backrow });
  else {
    // the moment Nibiru activates is itself a decision (e.g. chain Tachyon Transmigration from hand): try every option there
    const optsAt = (() => {
      const h = newDuel({ deck0: [...hand, ...deck], extra0: extra, deck1, hand0: hand.length }); const it = mkNib(k); let i = 0, out = [];
      for (let g = 0; g < 5000; g++) {
        const rr = runUntilPrompt(h, []); if (rr.ended) break;
        const p = rr.prompt; const c = choices(p);
        if (p.player !== 0) { lib.duelSetResponse(h, (it(p, c) ?? c[0]).res); continue; }
        if (i < f.responses.length) { lib.duelSetResponse(h, f.responses[i++]); continue; }
        out = c; break;
      }
      lib.destroyDuel(h); return out;
    })();
    let r = { value: -1 }, how = "";
    for (const o of optsAt.length ? optsAt : [null]) {
      const x = beamSolve(hand, deck, { width: Number(width), extra, deck1, interrupt: mkNib(k), prefix: o ? [...f.responses, o.res] : f.responses, timeLimitMs: 45000 });
      if ((x.value ?? -1) > r.value) { r = x; how = o?.label ?? ""; }
    }
    out.response = how;
    Object.assign(out, { nibAfter: `${f.matched}/${f.total} replay events`, board: r.score?.value ?? 0, parts: r.score?.parts.map((p) => p[0]), monsters: r.board?.monsters, backrow: r.board?.backrow, secs: +(r.ms / 1000).toFixed(1) });
  }
}
console.log(JSON.stringify(out));
