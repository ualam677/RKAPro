// The duel client protocol (packages/engine/client.mjs + session.mjs) under a random player:
// every answer the UI model offers must be accepted by the engine, undo must return to the exact previous screen,
// and a save state must load back to the same screen.
import test from "node:test";
import assert from "node:assert/strict";
import { id, mainList, extraList } from "../deck.mjs";
import { createSession, loadSession } from "../../packages/engine/session.mjs";
import { shuffled } from "../../packages/engine/api.mjs";

const rng = (seed) => { let a = seed; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];

/** A random legal answer to a UI prompt, built only from what the prompt offers. */
function randomAnswer(p, r) {
  switch (p.kind) {
    case "idle": { const all = [...p.actions, ...p.actions, ...p.actions, ...p.phases]; return { id: pick(r, all).id }; } // weighted towards playing cards
    case "yesno": return { yes: r() < 0.7 };
    case "options": return { id: pick(r, p.options).id };
    case "position": return { id: pick(r, p.positions).id };
    case "chain": return p.cards.length && (p.forced || r() < 0.7) ? { id: pick(r, p.cards).id } : { cancel: true };
    case "place": return { ids: shuffled(p.zones, Math.floor(r() * 1e9)).slice(0, p.count).map((z) => z.id) };
    case "cards": {
      const open = p.cards.filter((c) => !c.selected);
      if (p.oneByOne) return p.finish && (r() < 0.3 || !open.length) ? { finish: true } : { id: pick(r, open.length ? open : p.cards).id };
      const k = p.min + Math.floor(r() * (Math.min(p.max, p.cards.length) - p.min + 1));
      return { ids: shuffled(p.cards, Math.floor(r() * 1e9)).slice(0, k).map((c) => c.id) };
    }
  }
  throw new Error("unknown prompt kind " + p.kind);
}
const screen = (s) => { const { log: _l, ...v } = s.view(); return JSON.stringify(v, (_, x) => (typeof x === "bigint" ? Number(x) : x)); };

const starters = ["Galaxy Defense Robot Orbital 7", "Photon Delta Wing", "Galaxy Soldier", "Schwarzschild Infinity Dragon", "Seventh Tachyon"];
for (const seed of [1, 2, 3, 4, 5, 6]) {
  test(`random player, seed ${seed}: every offered answer is legal; undo and save states are exact`, () => {
    const r = rng(seed);
    const hand = [id(starters[seed % starters.length])]; const deck = shuffled(mainList(), seed); deck.splice(deck.indexOf(hand[0]), 1);
    const config = { deck0: [...hand, ...deck], extra0: extraList(), deck1: Array(40).fill(id("Dark Magician")), extra1: [], hand0: 5, hand1: 5, seed };
    let s = createSession(config, { autoPlace: seed % 2 === 0 });
    const kinds = new Set(); let decisions = 0;
    for (let i = 0; i < 250; i++) {
      const v = s.view(); if (!v.prompt) break;
      assert.equal(v.prompt.player, 0, "only the player is ever asked");
      kinds.add(v.prompt.kind);
      const before = i % 7 === 0 ? screen(s) : null;
      s.act(randomAnswer(v.prompt, r)); decisions++; // throws if the engine refuses the response
      if (before) { s.undo(); assert.equal(screen(s), before, "undo returns to the same screen"); s.act(randomAnswer(s.view().prompt, r)); }
      if (i === 40) { const json = s.save(); const want = screen(s); s.destroy(); s = loadSession(json, s.settings); assert.equal(screen(s), want, "save state loads to the same screen"); }
    }
    assert.ok(decisions > 30, `played ${decisions} decisions`);
    assert.ok(kinds.has("idle"), "saw the main phase");
    const v = s.view();
    assert.ok(v.log.length > 5 && v.turn >= 1 && v.sides[0].mzone.length === 7 && v.sides[0].szone.length === 8);
    s.destroy();
  });
}

// The user's five recorded lines, played through the duel client protocol: at every decision the screen model must
// offer exactly the click(s) the recorded line needs, and the session's automatic answers must match the recording.
import { readFileSync } from "fs";
import { logFromJSON } from "../../packages/engine/api.mjs";
import { scoreBoard, describeBoard, readSide } from "../board.mjs";
import { uiPrompt } from "../../packages/engine/client.mjs";
import { choices } from "../choices.mjs";

/** The UI answer that produces a recorded engine response (inverse of client.mjs answer()). */
function clickFor(p, res) {
  switch (p.type) {
    case 10: case 11: return { id: `${res.action}:${res.index ?? ""}` };
    case 12: case 13: return { yes: res.yes };
    case 14: return { id: String(res.index) };
    case 15: case 20: return res.indicies ? { ids: res.indicies.map(String) } : { cancel: true };
    case 26: return res.index === null ? { finish: true } : { id: String(res.index) };
    case 16: return res.index === null ? { cancel: true } : { id: String(res.index) };
    case 18: case 24: return { ids: res.places.map((z) => `${z.player}:${z.location}:${z.sequence}`) };
    case 19: return { id: String(res.position) };
  }
  const i = choices(p).findIndex((o) => same(o.res, res)); // sums, announcements: offered as a plain list
  if (i < 0) throw new Error("no click for prompt type " + p.type);
  return { id: String(i) };
}
function offered(ui, a) { // is that click actually on the screen?
  const ids = a.ids ?? (a.id !== undefined ? [a.id] : []);
  const pool = [...(ui.actions ?? []), ...(ui.phases ?? []), ...(ui.options ?? []), ...(ui.positions ?? []), ...(ui.cards ?? []), ...(ui.zones ?? [])].map((x) => x.id);
  return ids.every((i) => pool.includes(i)) && (!a.cancel || ui.cancel || ui.kind === "chain") && (!a.finish || ui.finish);
}
const same = (a, b) => JSON.stringify(a, (_, v) => (typeof v === "bigint" ? String(v) : v)) === JSON.stringify(b, (_, v) => (typeof v === "bigint" ? String(v) : v));

for (const ri of process.env.YGO_OMEGA_RULINGS ? [3] : [0, 1, 2, 4]) {
  const g = JSON.parse(readFileSync(new URL(`../../packs/galaxy-eyes/golden/${ri}.json`, import.meta.url), "utf8"));
  test(`${g.file}: the recorded line can be played click by click`, () => {
    const log = logFromJSON(JSON.stringify(g.log));
    const s = createSession(log.config);
    let clicks = 0;
    for (let guard = 0; guard < 1000; guard++) {
      const d = s.duel; const n = d.responses.length;
      const upTo = Math.min(n, log.responses.length); // after the recorded End Turn the session plays on (the opponent passes)
      assert.ok(same(d.responses.slice(0, upTo), log.responses.slice(0, upTo)), `automatic answers match the recording (at response ${n})`);
      if (n >= log.responses.length || !d.prompt) break;
      const click = clickFor(d.prompt, log.responses[n]);
      assert.ok(offered(uiPrompt(d.prompt), click), `response ${n}: the screen offers ${JSON.stringify(click)} for prompt type ${d.prompt.type}`);
      s.act(click); clicks++;
    }
    assert.ok(s.duel.responses.length >= log.responses.length, "played the whole line");
    const side = readSide(s.duel.handle, 0);
    assert.deepEqual({ board: scoreBoard(side).value, ...describeBoard(side) }, g.expect);
    assert.ok(clicks > 20, `${clicks} clicks`);
    s.destroy();
  });
}
