// A duel as the player experiences it: you decide, everything else (the goldfish opponent, forced or trivial
// prompts) is answered for you. Undo and save states are the action log replayed, so they are exact and portable.
// No Node-only imports.
import { createDuel, replay, logToJSON, logFromJSON } from "./api.mjs";
import { answer, autoAnswer, passAnswer, view } from "./client.mjs";

export function createSession(config, settings = {}, saved = null) {
  // `manual` = positions in the response log where the player made a real decision (undo steps back to these)
  const s = { duel: null, manual: saved ? [...saved.manual] : [], notes: saved?.notes ? [...saved.notes] : [], settings: { autoPlace: false, noChain: false, ...settings } };
  s.duel = saved ? replay({ config, responses: saved.responses }) : createDuel(config);

  function settle() {
    for (let guard = 0; guard < 5000 && s.duel.prompt; guard++) {
      const p = s.duel.prompt;
      const res = p.player !== 0 ? passAnswer(p) : autoAnswer(p, s.settings);
      if (!res) return;
      s.duel.respond(res);
    }
  }
  settle(); // also after loading: a log that stops mid-automatic-step (e.g. a recorded line) is carried to the next real decision

  return {
    get settings() { return s.settings; },
    get duel() { return s.duel; },
    setSettings(x) { Object.assign(s.settings, x); settle(); },
    view() { return { ...view(s.duel), canUndo: s.manual.length > 0, decisions: s.manual.length, settings: s.settings, notes: s.notes }; },
    /** A note attached to the current point of the duel; kept in the save state, dropped when you undo past it. */
    note(text) { s.notes.push({ decisions: s.manual.length, text: String(text).slice(0, 500) }); },
    /** A player decision: { id }, { ids }, { yes }, { cancel }, { finish }. Throws if the engine refuses it. */
    act(a) {
      if (!s.duel.prompt) throw new Error("The duel is over");
      const at = s.duel.responses.length;
      s.duel.respond(answer(s.duel.prompt, a));
      s.manual.push(at); settle();
    },
    /** Step back `n` player decisions. */
    undo(n = 1) {
      if (!s.manual.length) return;
      const at = s.manual[Math.max(0, s.manual.length - n)];
      const log = { config, responses: s.duel.responses.slice(0, at) };
      s.manual = s.manual.filter((i) => i < at);
      s.notes = s.notes.filter((n) => n.decisions <= s.manual.length);
      s.duel.destroy(); s.duel = replay(log);
    },
    /** JSON text of the save state: ordered decks + seed + every response (+ which were the player's). */
    save() { return logToJSON({ config, responses: s.duel.responses, manual: s.manual, notes: s.notes }); },
    destroy() { s.duel.destroy(); },
  };
}

export function loadSession(json, settings) {
  const saved = logFromJSON(json);
  return createSession(saved.config, settings, saved);
}
