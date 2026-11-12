// Duel client protocol: turns the engine's state and prompts into a plain-JSON screen model, and the player's
// clicks back into engine responses. Full fidelity (every zone, every position), unlike choices.mjs which
// collapses options for the search. No Node-only imports; strings (card texts, system strings) are injected.
import { lib, nameOf } from "./core.mjs";
import { choices } from "./choices.mjs";

const Q = { CODE: 1, POSITION: 2, TYPE: 8, LEVEL: 16, RANK: 32, ATTACK: 256, DEFENSE: 512, OVERLAY: 65536, COUNTERS: 131072 };
const LOC = { DECK: 1, HAND: 2, MZONE: 4, SZONE: 8, GRAVE: 16, REMOVED: 32, EXTRA: 64 };
const LOC_NAME = { 1: "Deck", 2: "Hand", 4: "Monster Zone", 8: "Spell & Trap Zone", 16: "GY", 32: "Banished", 64: "Extra Deck" };
const PHASE = { 1: "Draw Phase", 2: "Standby Phase", 4: "Main Phase 1", 8: "Battle Phase", 16: "Battle Step", 32: "Damage Step", 64: "Damage Calculation", 128: "Battle Phase", 256: "Main Phase 2", 512: "End Phase" };
const T = { BATTLE: 10, IDLE: 11, EFFYN: 12, YESNO: 13, OPTION: 14, CARD: 15, CHAIN: 16, PLACE: 18, POS: 19, TRIBUTE: 20, SORTCHAIN: 21, COUNTER: 22, SUM: 23, DISFIELD: 24, SORT: 25, UNSELECT: 26, RPS: 132 };
const POS_LABEL = { 1: "Attack Position", 2: "Face-down Attack", 4: "Defense Position", 8: "Face-down Defense" };

let strings = { system: () => null, card: () => null };
/** system(n) -> EDOPro system string or null; card(code, i) -> the card's i-th effect string or null. */
export const setStrings = (s) => { strings = s; };
/** Text for an effect description number: card strings are (code << 20) | index, small numbers are system strings. */
export function describe(desc) {
  const d = BigInt(desc ?? 0); if (d === 0n) return "";
  const code = Number(d >> 20n), i = Number(d & 0xfffffn);
  return (code ? strings.card(code, i) : strings.system(i)) ?? "";
}

// EDOPro's strings carry printf placeholders ('Use the effect of "%ls" from [%ls]?'). Fill them in order, as EDOPro does.
export const sprintf = (s, ...args) => { let i = 0; return String(s ?? "").replace(/%(ls|s|d|u)/g, () => String(args[i++] ?? "")); };
/** Location wording, ported from EDOPro (gframe/data_manager.cpp FormatLocation): system strings 1000 to 1009. */
export function formatLocation(location, sequence) {
  const sys = (n, fallback) => strings.system(n) ?? fallback;
  if (location === 8) return sequence < 5 ? sys(1003, "Spell/Trap Zone") : sequence === 5 ? sys(1008, "Field Spell Zone") : sys(1009, "Pendulum Zone");
  const i = [1, 2, 4, 8, 16, 32, 64, 128].indexOf(location);
  return i < 0 ? "???" : sys(1000 + i, ["Deck", "Hand", "Monster Zone", "Spell/Trap Zone", "Graveyard", "Banished", "Extra Deck", "Xyz Material"][i]);
}
/** The yes/no question for an effect, ported from EDOPro (gframe/duelclient.cpp, MSG_SELECT_EFFECTYN). */
function effectQuestion(p) {
  const d = Number(BigInt(p.description ?? 0)), name = nameOf(p.code), where = formatLocation(p.location, p.sequence);
  if (d === 0) return sprintf(strings.system(200) ?? 'Use the effect of "%ls" from [%ls]?', name, where);
  if (d === 221) return [sprintf(strings.system(221) ?? 'Activate the Trigger Effect of "%ls" from [%ls]?', name, where), (strings.system(223) ?? "").trim()].filter(Boolean).join(" ");
  return sprintf(describe(p.description) || 'Activate the effect of "%ls"?', name);
}

// ---------- state ----------
function zone(h, p, loc, flags, size) {
  const raw = lib.duelQueryLocation(h, { flags, controller: p, location: loc }) ?? [];
  const cards = raw.map((c, seq) => (c ? { code: c.code ?? 0, pos: c.position ?? 0, atk: c.attack, def: c.defense, level: c.rank || c.level || 0, mats: c.overlayCards ?? [], counters: c.counters, c: p, loc, seq } : null));
  if (size) { while (cards.length < size) cards.push(null); return cards; }
  return cards.filter(Boolean);
}
const FIELD = Q.CODE | Q.POSITION | Q.LEVEL | Q.RANK | Q.ATTACK | Q.DEFENSE | Q.OVERLAY | Q.COUNTERS;
function side(h, p) {
  return {
    hand: zone(h, p, LOC.HAND, Q.CODE | Q.POSITION), mzone: zone(h, p, LOC.MZONE, FIELD, 7), szone: zone(h, p, LOC.SZONE, Q.CODE | Q.POSITION | Q.COUNTERS, 8),
    grave: zone(h, p, LOC.GRAVE, Q.CODE), banished: zone(h, p, LOC.REMOVED, Q.CODE | Q.POSITION), extra: zone(h, p, LOC.EXTRA, Q.CODE | Q.POSITION),
    deck: lib.duelQueryCount(h, p, LOC.DECK),
  };
}

/** Turn, phase, LP, chain and the chat log, all derived from the message stream (so they survive undo and replay). */
export function summarise(messages, startLP = 8000) {
  const s = { turn: 0, turnPlayer: 0, phase: "", lp: [startLP, startLP], chain: [], log: [], summons: 0, winner: null };
  const who = (p) => (p === 0 ? "You" : "Opponent");
  const say = (kind, text) => s.log.push({ kind, text, turn: s.turn });
  // Hand-trap windows (what the opponent could have answered), worked out from what each of your effects did:
  let solving = null, drollSaid = false;
  for (const m of messages) {
    switch (m.type) {
      case 40: s.turn++; s.turnPlayer = m.player; s.summons = 0; drollSaid = false; say("turn", `Turn ${s.turn}: ${who(m.player)}`); break;
      case 41: s.phase = PHASE[m.phase] ?? ""; if (s.phase) say("phase", s.phase); break;
      case 90: say("move", `${who(m.player)} draw${m.player === 0 ? "" : "s"} ${m.drawn.length} card${m.drawn.length === 1 ? "" : "s"}`); break;
      case 50: {
        const ov = (l) => l.overlay_sequence !== undefined;
        if (!m.card || (ov(m.from) && ov(m.to))) break; // material transfers and hidden moves are noise
        if (m.from.location === 0) break;
        if (solving && m.from.location === 1 && m.to.controller === 0 && !ov(m.from)) { if (m.to.location === 2) solving.add = true; solving.deck = true; }
        const from = ov(m.from) ? "Xyz Material" : LOC_NAME[m.from.location & 0x7f], to = ov(m.to) ? "Xyz Material" : LOC_NAME[m.to.location & 0x7f];
        if (from && to && from !== to) say("move", `${nameOf(m.card)}: ${from} → ${to}`);
        break;
      }
      case 54: say("move", `${who(m.controller)} Set a card`); break;
      case 60: case 62: {
        if (m.controller === s.turnPlayer) s.summons++;
        say("summon", `${m.type === 60 ? "Normal" : "Special"} Summon: ${nameOf(m.code)}${m.controller === 0 ? ` (summon ${s.summons} this turn)` : ""}`);
        // Nibiru needs 5+ summons in the turn: from the 5th on, every summon is a window for the opponent
        if (m.controller === 0 && s.summons === 5) say("warn", "Summon 5: Nibiru is live from here");
        break;
      }
      case 64: say("summon", `Flip Summon: ${nameOf(m.code)}`); break;
      case 70:
        if (m.controller === 0 && m.location === 4) say("window", `Window: Effect Veiler, Infinite Impermanence, Ghost Ogre (${nameOf(m.code)} activated on the field)`);
        s.chain.push({ code: m.code, c: m.controller }); say("chain", `Chain ${m.chain_size}: ${nameOf(m.code)}${describe(m.description) ? ` (${describe(m.description).slice(0, 80)})` : ""}`); break;
      case 72: solving = s.chain.length && s.chain[s.chain.length - 1].c === 0 ? { deck: false, add: false, code: s.chain[s.chain.length - 1].code } : null; break;
      case 73:
        if (solving?.deck) say("window", `Window: Ash Blossom (${nameOf(solving.code)} took a card from the Deck)`);
        if (solving?.add && !drollSaid) { drollSaid = true; say("window", "Window: Droll & Lock Bird (first card added from the Deck this turn)"); }
        solving = null; s.chain.pop(); break;
      case 74: s.chain.length = 0; break;
      case 75: case 76: say("warn", `Chain ${m.chain_size ?? ""} negated`); break;
      case 91: s.lp[m.player] = Math.max(0, s.lp[m.player] - m.amount); say("lp", `${who(m.player)} take${m.player === 0 ? "" : "s"} ${m.amount} damage`); break;
      case 92: s.lp[m.player] += m.amount; say("lp", `${who(m.player)} gain${m.player === 0 ? "" : "s"} ${m.amount} LP`); break;
      case 94: s.lp[m.player] = m.lp; break;
      case 100: s.lp[m.player] = Math.max(0, s.lp[m.player] - m.amount); say("lp", `${who(m.player)} pay${m.player === 0 ? "" : "s"} ${m.amount} LP`); break;
      case 110: say("chain", `Attack declared`); break;
      case 5: s.winner = m.player; say("turn", m.player === 0 ? "You win" : m.player === 1 ? "You lose" : "Draw"); break;
      case 1: say("warn", "The engine rejected that response (retry)"); break;
    }
  }
  return s;
}

/** What the player did, in order: every summon and activation of player 0. This is the shape stored lines are kept in. */
export function steps(messages) {
  const out = [];
  for (const m of messages) {
    if ((m.type === 60 || m.type === 62) && m.controller === 0) out.push({ k: "summon", name: nameOf(m.code) });
    else if (m.type === 70 && m.controller === 0) out.push({ k: "activate", name: nameOf(m.code) });
  }
  return out;
}

// ---------- prompts ----------
const ref = (c, id, extra = {}) => ({ id, code: c.code, c: c.controller, loc: c.location, seq: c.sequence, pos: c.position, ...extra });
const freeZones = (p) => {
  const out = [];
  for (const [player, base] of [[p.player, 0], [1 - p.player, 16]]) {
    for (let s = 0; s < 7; s++) if (!(p.field_mask & (1 << (base + s)))) out.push({ id: `${player}:4:${s}`, c: player, loc: 4, seq: s });
    for (let s = 0; s < 8; s++) if (!(p.field_mask & (1 << (base + 8 + s)))) out.push({ id: `${player}:8:${s}`, c: player, loc: 8, seq: s });
  }
  return out;
};

/** The prompt as the UI shows it. `kind` picks the widget; every selectable thing has an `id` to send back. */
export function uiPrompt(p) {
  if (!p) return null;
  const base = { player: p.player, type: p.type };
  switch (p.type) {
    case T.IDLE: {
      const a = []; const add = (list, action, verb) => list.forEach((c, i) => a.push(ref(c, `${action}:${i}`, { verb, desc: describe(c.description) })));
      add(p.summons, 0, "Normal Summon"); add(p.special_summons, 1, "Special Summon"); add(p.pos_changes, 2, "Change position");
      add(p.monster_sets, 3, "Set"); add(p.spell_sets, 4, "Set"); add(p.activates, 5, "Activate");
      return { ...base, kind: "idle", title: "Main Phase", actions: a, phases: [...(p.to_bp ? [{ id: "6:", label: "Battle Phase" }] : []), ...(p.to_ep ? [{ id: "7:", label: "End Turn" }] : [])] };
    }
    case T.BATTLE: {
      const a = [];
      p.chains.forEach((c, i) => a.push(ref(c, `0:${i}`, { verb: "Activate", desc: describe(c.description) })));
      p.attacks.forEach((c, i) => a.push(ref(c, `1:${i}`, { verb: c.can_direct ? "Attack directly" : "Attack" })));
      return { ...base, kind: "idle", title: "Battle Phase", actions: a, phases: [...(p.to_m2 ? [{ id: "2:", label: "Main Phase 2" }] : []), ...(p.to_ep ? [{ id: "3:", label: "End Turn" }] : [])] };
    }
    case T.EFFYN: return { ...base, kind: "yesno", title: effectQuestion(p), card: ref(p, "") };
    case T.YESNO: return { ...base, kind: "yesno", title: describe(p.description) || "Yes or no?" };
    case T.OPTION: return { ...base, kind: "options", title: "Choose one", options: p.options.map((o, i) => ({ id: String(i), label: describe(o) || `Option ${i + 1}` })) };
    case T.CARD: case T.TRIBUTE:
      return { ...base, kind: "cards", title: p.type === T.TRIBUTE ? "Select the card(s) to Tribute" : "Select card(s)", min: p.min, max: p.max, cancel: !!p.can_cancel, cards: p.selects.map((c, i) => ref(c, String(i))) };
    case T.UNSELECT:
      return { ...base, kind: "cards", title: "Select card(s)", min: 1, max: 1, cancel: !!p.can_cancel, finish: !!p.can_finish, oneByOne: true,
        cards: [...p.select_cards.map((c, i) => ref(c, String(i))), ...p.unselect_cards.map((c, i) => ref(c, String(p.select_cards.length + i), { selected: true }))] };
    case T.CHAIN: return { ...base, kind: "chain", title: "Activate a card or effect?", forced: !!p.forced, cards: p.selects.map((c, i) => ref(c, String(i), { desc: describe(c.description) })) };
    case T.PLACE: case T.DISFIELD: return { ...base, kind: "place", title: p.type === T.PLACE ? "Select a zone" : "Select a zone to disable", count: p.count, zones: freeZones(p) };
    case T.POS: return { ...base, kind: "position", title: `Position for "${nameOf(p.code)}"`, code: p.code, positions: [1, 4, 8, 2].filter((x) => p.positions & x).map((x) => ({ id: String(x), label: POS_LABEL[x] })) };
    default: // sums, announcements, counters, sort order: the search's enumeration is good enough as a list
      return { ...base, kind: "options", title: "Choose", options: choices(p).map((o, i) => ({ id: String(i), label: o.label })) };
  }
}

/** The engine response for a UI answer: { id } for one thing, { ids } for several, { yes }, { cancel: true } or { finish: true }. */
export function answer(p, a) {
  const num = (x) => Number(x);
  switch (p.type) {
    case T.IDLE: case T.BATTLE: { const [action, index] = a.id.split(":"); return { type: p.type === T.IDLE ? 1 : 0, action: num(action), index: index === "" ? null : num(index) }; }
    case T.EFFYN: return { type: 2, yes: !!a.yes };
    case T.YESNO: return { type: 3, yes: !!a.yes };
    case T.OPTION: return { type: 4, index: num(a.id) };
    case T.CARD: return { type: 5, indicies: a.cancel ? null : a.ids.map(num) };
    case T.TRIBUTE: return { type: 12, indicies: a.cancel ? null : a.ids.map(num) };
    case T.UNSELECT: return { type: 7, index: a.cancel || a.finish ? null : num(a.id ?? a.ids[0]) };
    case T.CHAIN: return { type: 8, index: a.id === undefined || a.cancel ? null : num(a.id) };
    case T.PLACE: case T.DISFIELD: return { type: p.type === T.PLACE ? 10 : 9, places: (a.ids ?? [a.id]).map((id) => { const [player, location, sequence] = id.split(":").map(num); return { player, location, sequence }; }) };
    case T.POS: return { type: 11, position: num(a.id) };
    default: return choices(p)[num(a.id)].res;
  }
}

/**
 * Answers the player should not be asked for (EDOPro does the same): nothing to chain, only one legal zone or
 * position, forced picks, sort order. Returns an engine response, or null when the player must decide.
 * settings.autoPlace: also pick the zone when there are several (Extra Monster Zone first, like the search).
 * settings.noChain: never ask about optional chains (EDOPro's "ignore chains").
 * settings.alwaysChain: ask whenever anything can be chained, even at an open game state (EDOPro's "chain when available").
 */
export function autoAnswer(p, settings = {}) {
  switch (p.type) {
    case T.CHAIN:
      if (p.forced) return p.selects.length === 1 ? { type: 8, index: 0 } : null;
      // like EDOPro: with nothing relevant to this timing (spe_count 0) you are only asked when "always chain" is on
      return p.selects.length === 0 || settings.noChain || (p.spe_count === 0 && !settings.alwaysChain) ? { type: 8, index: null } : null;
    case T.PLACE: case T.DISFIELD: { const z = freeZones(p); return z.length <= p.count || settings.autoPlace ? choices(p)[0].res : null; }
    case T.POS: { const n = [1, 2, 4, 8].filter((x) => p.positions & x); return n.length === 1 ? { type: 11, position: n[0] } : null; }
    case T.CARD: case T.TRIBUTE: return p.min === p.max && p.max === p.selects.length && !p.can_cancel ? { type: p.type === T.CARD ? 5 : 12, indicies: p.selects.map((_, i) => i) } : null;
    case T.SORT: case T.SORTCHAIN: case T.COUNTER: case T.RPS: return choices(p)[0].res;
    default: return null;
  }
}
/** The goldfish opponent: never does anything. */
export const passAnswer = (p) => { const c = choices(p); return (c.find((x) => x.pass) ?? c.find((x) => x.end) ?? c.find((x) => /^No/.test(x.label)) ?? c[0]).res; };

/** Everything the screen needs, as plain JSON. */
export function view(duel) {
  const s = summarise(duel.messages);
  const prompt = uiPrompt(duel.prompt);
  // what just happened ("X was Special Summoned"), which EDOPro shows above an effect question
  if (prompt && prompt.type === T.EFFYN) for (let i = duel.messages.length - 2; i >= Math.max(0, duel.messages.length - 30); i--) {
    const m = duel.messages[i]; if (m.type === 2 && m.hint_type === 1) { prompt.text = sprintf(describe(m.hint)); break; }
  }
  // What a selection is for. Ported from EDOPro (gframe/duelclient.cpp): the engine sends a hint just before the prompt
  // (select_hint); without one EDOPro falls back to a default system string per prompt type.
  if (prompt && ["cards", "place", "options"].includes(prompt.kind)) {
    let hint = 0n;
    for (let i = duel.messages.length - 2; i >= Math.max(0, duel.messages.length - 8); i--) {
      const m = duel.messages[i]; if (m.type === 2 && m.hint_type === 3 && m.player === prompt.player) { hint = BigInt(m.hint); break; }
    }
    const sys = (n) => strings.system(n);
    if (prompt.kind === "place") // for a zone the hint is the card's passcode: 'Select the zone to place "%ls"'
      prompt.title = (prompt.type === T.PLACE && hint ? sprintf(sys(569) ?? 'Select the zone to place "%ls"', nameOf(Number(hint))) : sys(570)) ?? prompt.title;
    else if (prompt.kind === "cards") {
      const text = (hint ? describe(hint) : sys(prompt.type === T.TRIBUTE ? 531 : 560)) || prompt.title;
      prompt.title = prompt.oneByOne ? text : `${text} (${prompt.min}-${prompt.max})`;
    } else if (hint && duel.prompt.type === T.OPTION) prompt.title = describe(hint) || prompt.title;
  }
  return { ...s, ended: duel.ended, sides: [side(duel.handle, 0), side(duel.handle, 1)], prompt, steps: duel.responses.length };
}
