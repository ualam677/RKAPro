// Library API over the engine core: createDuel, options (legal, labelled), respond, snapshot/restore, actionLog, replay.
// A save state is the ACTION LOG (ordered decks + seed + every response): small, portable, deterministic.
// Heap snapshots are only an in-memory speed cache. No Node-only imports (ROADMAP constraint).
import { lib, newDuel, runUntilPrompt } from "./core.mjs";
import { choices } from "./choices.mjs";
import { save, restore } from "./state.mjs";
import { readSide } from "./board.mjs";

/** Small seeded RNG (mulberry32) so a shuffled deck is reproducible from the seed. */
export function shuffled(list, seed) {
  let a = seed >>> 0; const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const d = [...list]; for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

// responses can hold BigInt (declared races): keep the log JSON-safe
export const logToJSON = (log) => JSON.stringify(log, (_, v) => (typeof v === "bigint" ? { $big: v.toString() } : v));
export const logFromJSON = (s) => JSON.parse(s, (_, v) => (v && typeof v === "object" && "$big" in v ? BigInt(v.$big) : v));

/**
 * config: { deck0, extra0, deck1, extra1, hand0, hand1, seed } with decks TOP CARD FIRST (shuffle before, with shuffled()).
 * shortcut: one live duel per process (ocgcore-wasm has one heap, and restore() rewinds all of it); run a second
 * engine in another worker/process when two duels must be alive at once.
 */
export function createDuel(config) {
  const cfg = { extra0: [], extra1: [], hand0: 5, hand1: 5, seed: 1, ...config };
  const h = newDuel(cfg);
  const d = {
    config: cfg, responses: [], messages: [], prompt: null, ended: false,
    /** Legal options at the current prompt, each { label, res, ... }. Empty when the duel has ended. */
    options() { return d.prompt ? choices(d.prompt) : []; },
    /** Answer the current prompt (pass an option's `res`) and run to the next one. */
    respond(res) {
      if (!d.prompt) throw new Error("no prompt to respond to");
      lib.duelSetResponse(h, res); d.responses.push(res); advance();
      return d;
    },
    /** In-memory save point. Cheap, but only valid in this process and for this duel. */
    snapshot() { return { heap: save(), n: d.responses.length, m: d.messages.length, prompt: d.prompt, ended: d.ended }; },
    restore(s) { restore(s.heap); d.responses.length = s.n; d.messages.length = s.m; d.prompt = s.prompt; d.ended = s.ended; return d; },
    /** The portable save state. */
    actionLog() { return { config: cfg, responses: [...d.responses] }; },
    /** Visible state of one side. */
    side(p = 0) { return readSide(h, p); },
    destroy() { lib.destroyDuel(h); },
    handle: h,
  };
  function advance() {
    const r = runUntilPrompt(h, d.messages);
    if (r.retry) { // illegal response: forget it and stay on the same prompt
      d.responses.pop(); while (d.messages.length && d.messages[d.messages.length - 1].type === 1) d.messages.pop();
      throw new Error("The engine refused that response");
    }
    d.prompt = r.prompt; d.ended = !!r.ended;
  }
  advance();
  return d;
}

/** Rebuild a duel from an action log (optionally only the first `upTo` responses): deterministic replay. */
export function replay(log, upTo = log.responses.length) {
  const d = createDuel(log.config);
  for (let i = 0; i < upTo; i++) d.respond(log.responses[i]);
  return d;
}
