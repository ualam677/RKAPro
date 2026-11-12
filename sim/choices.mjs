// Turn engine prompts into a list of legal choices (each with a response + readable label).
import { nameOf, cards } from "./engine.mjs";

const T = { BATTLE: 10, IDLE: 11, EFFYN: 12, YESNO: 13, OPTION: 14, CARD: 15, CHAIN: 16, PLACE: 18, POS: 19, TRIBUTE: 20, SORTCHAIN: 21, COUNTER: 22, SUM: 23, DISFIELD: 24, SORT: 25, UNSELECT: 26, RPS: 132, ARACE: 140, AATTR: 141, ACARD: 142, ANUM: 143 };
export { T };
const R = { BATTLE: 0, IDLE: 1, EFFYN: 2, YESNO: 3, OPTION: 4, CARD: 5, UNSELECT: 7, CHAIN: 8, DISFIELD: 9, PLACE: 10, POS: 11, TRIBUTE: 12, COUNTER: 13, SUM: 14, SORT: 15, ARACE: 16, AATTR: 17, ACARD: 18, ANUM: 19, RPS: 20 };

/** k-combinations of indices 0..n-1 (sizes min..max), capped. */
function* combos(n, min, max, cap = 200) {
  let made = 0;
  for (let k = Math.max(min, 1); k <= Math.min(max, n); k++) {
    const idx = Array.from({ length: k }, (_, i) => i);
    for (;;) {
      yield idx.slice(); if (++made >= cap) return;
      let i = k - 1; while (i >= 0 && idx[i] === n - k + i) i--;
      if (i < 0) break; idx[i]++; for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
    }
  }
}
const locName = (l) => ({ 1: "Deck", 2: "hand", 4: "field", 8: "S/T", 16: "GY", 32: "banished", 64: "Extra" })[l] ?? `loc${l}`;
const cardKey = (c) => `${c.code}@${c.location}`; // same card in same zone = interchangeable

/**
 * Choices for a prompt. Interchangeable options (same card in the same zone) are collapsed,
 * which is what keeps the search small.
 */
let zoneBranching = false;
export const setZoneBranching = (on) => { zoneBranching = on; };
export function choices(p, policy = {}) {
  switch (p.type) {
    case T.IDLE: {
      const out = [];
      const add = (list, action, verb, keep = () => true) => {
        const seen = new Set();
        list.forEach((c, i) => {
          if (!keep(c)) return;
          const k = `${verb}|${cardKey(c)}|${c.description ?? ""}`;
          if (seen.has(k)) return; seen.add(k);
          out.push({ label: `${verb} ${nameOf(c.code)}${c.location !== 2 ? ` (${locName(c.location)})` : ""}`, res: { type: R.IDLE, action, index: i }, code: c.code, verb });
        });
      };
      add(p.summons, 0, "Normal Summon");
      add(p.special_summons, 1, "Special Summon");
      add(p.activates, 5, "Activate");
      // Set Traps only (Eternal Galaxy, Transmigration, ...): setting Normal Spells is never useful here
      add(p.spell_sets, 4, "Set", (c) => (cards.get(c.code)?.type ?? 0) & 4);
      if (p.to_ep) out.push({ label: "End turn", res: { type: R.IDLE, action: 7, index: null }, end: true });
      return out;
    }
    case T.BATTLE:
      return p.to_ep ? [{ label: "End turn", res: { type: R.BATTLE, action: 3, index: null }, end: true }]
        : [{ label: "Main 2", res: { type: R.BATTLE, action: 2, index: null } }];
    case T.EFFYN: return [
      { label: `Yes: ${nameOf(p.code)}`, res: { type: R.EFFYN, yes: true }, code: p.code },
      { label: `No: ${nameOf(p.code)}`, res: { type: R.EFFYN, yes: false } }];
    case T.YESNO: return [{ label: "Yes", res: { type: R.YESNO, yes: true } }, { label: "No", res: { type: R.YESNO, yes: false } }];
    case T.OPTION: return p.options.map((o, i) => ({ label: `Option ${i}`, res: { type: R.OPTION, index: i } }));
    case T.CHAIN: {
      const out = [];
      if (!p.forced) out.push({ label: "Don't chain", res: { type: R.CHAIN, index: null }, pass: true });
      const seen = new Set();
      p.selects.forEach((c, i) => {
        const k = `${cardKey(c)}|${c.description}`;
        if (seen.has(k)) return; seen.add(k);
        out.push({ label: `Chain ${nameOf(c.code)}${c.location !== 4 ? ` (${locName(c.location)})` : ""}`, res: { type: R.CHAIN, index: i }, code: c.code });
      });
      return out;
    }
    case T.CARD: case T.TRIBUTE: {
      const sel = p.selects;
      // collapse identical cards: choose by multiset of keys
      const out = []; const seen = new Set();
      for (const idx of combos(sel.length, p.min, p.max)) {
        const k = idx.map((i) => cardKey(sel[i])).sort().join(",");
        if (seen.has(k)) continue; seen.add(k);
        out.push({ label: `Pick ${idx.map((i) => nameOf(sel[i].code) + (sel[i].location !== 2 ? `(${locName(sel[i].location)})` : "")).join(" + ")}`, res: { type: p.type === T.CARD ? R.CARD : R.TRIBUTE, indicies: idx }, picks: idx.map((i) => sel[i].code) });
      }
      return out;
    }
    case T.UNSELECT: {
      const out = [];
      if (p.can_finish) out.push({ label: "Finish selection", res: { type: R.UNSELECT, index: null } });
      const seen = new Set();
      p.select_cards.forEach((c, i) => {
        const k = cardKey(c); if (seen.has(k)) return; seen.add(k);
        out.push({ label: `Select ${nameOf(c.code)}${c.location !== 2 ? `(${locName(c.location)})` : ""}`, res: { type: R.UNSELECT, index: i }, picks: [c.code] });
      });
      return out;
    }
    case T.SUM: {
      // pick subsets of the optional cards whose amounts (with the musts) hit the target
      const must = p.selects_must, opt = p.selects;
      const val = (c) => [c.amount & 0xffff, c.amount >>> 16].filter((x) => x > 0);
      const out = []; const seen = new Set();
      for (const idx of combos(opt.length, p.min || 1, p.max || opt.length, 400)) {
        const parts = [...must, ...idx.map((i) => opt[i])];
        let sums = new Set([0]);
        for (const c of parts) { const n = new Set(); for (const s of sums) for (const v of val(c)) n.add(s + v); sums = n; }
        const ok = p.select_max ? [...sums].some((s) => s >= p.amount) : sums.has(p.amount);
        if (!ok) continue;
        const k = idx.map((i) => cardKey(opt[i])).sort().join(",");
        if (seen.has(k)) continue; seen.add(k);
        out.push({ label: `Sum ${idx.map((i) => nameOf(opt[i].code)).join(" + ")}`, res: { type: R.SUM, indicies: [...must.map((_, i) => i), ...idx.map((i) => must.length + i)] } });
      }
      return out.length ? out : [{ label: "Sum (fallback)", res: { type: R.SUM, indicies: opt.map((_, i) => must.length + i) } }];
    }
    case T.PLACE: case T.DISFIELD: {
      // Extra Monster Zone first (only Extra Deck summons are offered it, and it keeps a main zone free).
      // With zone branching on, also offer the main-zone placement: which Xyz sits in the EMZ decides later revives.
      const mask = p.field_mask;
      const build = (order) => {
        const places = [];
        for (const [player, base] of [[p.player, 0], [1 - p.player, 16]]) {
          for (const s of order) if (places.length < p.count && !(mask & (1 << (base + s)))) places.push({ player, location: 4, sequence: s });
          for (let s = 0; s < 8 && places.length < p.count; s++) if (!(mask & (1 << (base + 8 + s)))) places.push({ player, location: 8, sequence: s });
        }
        return { type: p.type === T.PLACE ? R.PLACE : R.DISFIELD, places };
      };
      const emz = build([5, 6, 0, 1, 2, 3, 4]), main = build([0, 1, 2, 3, 4, 5, 6]);
      const same = JSON.stringify(emz) === JSON.stringify(main);
      if (!zoneBranching || same) return [{ label: "Place", res: emz }];
      return [{ label: "Place (Extra Monster Zone)", res: emz }, { label: "Place (main zone)", res: main }];
    }
    case T.POS: {
      const pos = [1, 4, 2, 8].find((x) => p.positions & x);
      return [{ label: "Position", res: { type: R.POS, position: pos } }];
    }
    case T.SORT: case T.SORTCHAIN: return [{ label: "Default order", res: { type: R.SORT, order: null } }];
    case T.COUNTER: return [{ label: "Counters", res: { type: R.COUNTER, counters: p.cards.map((c, i) => (i === 0 ? p.count : 0)) } }];
    case T.AATTR: return [{ label: "LIGHT", res: { type: R.AATTR, attributes: [16] } }];
    case T.ARACE: return [{ label: "Dragon", res: { type: R.ARACE, races: [0x2000n] } }];
    case T.ANUM: return p.options.map((o, i) => ({ label: `Number ${o}`, res: { type: R.ANUM, value: i } }));
    case T.ACARD: return [{ label: "Declare", res: { type: R.ACARD, card: 14558127 } }];
    case T.RPS: return [{ label: "Rock", res: { type: R.RPS, value: 2 } }];
    default: throw new Error(`Unhandled prompt type ${p.type}`);
  }
}
