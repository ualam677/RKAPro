import { DeckEntry, Filter, matches } from "./filters";

/**
 * Exact, card-level opening-hand engine.
 *
 * Model (inspired by SeyTi01's ygo-advanced-probability-calculator):
 *  - A Line is a playable hand pattern: several requirements that must ALL be met,
 *    each by DIFFERENT physical cards (Galaxy Soldier can't discard itself).
 *  - A Goal succeeds if ANY of its lines is met. Unions are exact (no double counting).
 *  - Searchers: after the draw, each searcher card in hand may add 1 matching card
 *    still in the Deck (once per card name). Spells/Traps are used up; monsters stay.
 *  - Pot of Prosperity: excavate 6 from the remaining Deck, add 1. Only searchers
 *    already in hand can act afterwards (an excavated searcher doesn't).
 *  - "Avoid" rules (e.g. 0 Bricks) are checked on the opening hand.
 *
 * Exact counting: cards that behave identically for every filter in play are merged
 * into one class, then every hand composition over the classes is enumerated and
 * weighted with the multivariate hypergeometric distribution.
 */

/**
 * Where the card has to be for the line to work:
 *  hand – in the opening hand (default)
 *  deck – still in the Deck (searched / sent / summoned from Deck); drawing it hurts
 *  any  – just has to be in your 40 (hand or Deck), e.g. a card you search late but can also draw
 */
export type Zone = "hand" | "deck" | "any";
export interface Requirement { match: Filter; min: number; max?: number; from?: Zone }
export interface Line { name: string; reqs: Requirement[] }
export interface Goal { name: string; handSize: number; lines: Line[]; avoid?: Requirement[] }
export interface Effects {
  /** card id -> what it can add from the Deck */
  search: Record<number, {
    target: Filter;
    usedUp?: boolean;
    /** Must send another card matching this from hand to the GY first (Galaxy Soldier: another LIGHT monster). */
    cost?: Filter;
    /** After searching, must put 1 card from hand back on top of the Deck (Seventh Tachyon). The best card is chosen. */
    putBack?: boolean;
  }>;
  /** card ids that work like Pot of Prosperity (excavate N, add 1) */
  excavate: Record<number, number>;
}
export const NO_EFFECTS: Effects = { search: {}, excavate: {} };

export interface GoalResult { p: number; perLine: number[] }

// ---------- combinatorics ----------
const lf: number[] = [0];
const lnFact = (n: number) => { for (let i = lf.length; i <= n; i++) lf[i] = lf[i - 1] + Math.log(i); return lf[n]; };
export const lnChoose = (n: number, k: number) => (k < 0 || k > n ? -Infinity : lnFact(n) - lnFact(k) - lnFact(n - k));

// ---------- classes ----------
interface Klass { n: number; sig: string; searchTarget?: number[]; costCls?: number[]; putBack?: boolean; usedUp?: boolean; excavate?: number; members: number[] }

function buildClasses(deck: DeckEntry[], goals: Goal[], fx: Effects) {
  const filters = new Set<Filter>();
  for (const g of goals) {
    for (const l of g.lines) for (const r of l.reqs) filters.add(r.match);
    for (const r of g.avoid ?? []) filters.add(r.match);
  }
  for (const s of Object.values(fx.search)) { filters.add(s.target); if (s.cost) filters.add(s.cost); }
  const fl = [...filters];

  const bySig = new Map<string, Klass>();
  for (const e of deck) {
    if (e.copies <= 0) continue;
    const isEffect = fx.search[e.id] || fx.excavate[e.id];
    // effect cards keep their own class so "once per card name" and targets stay exact
    const sig = fl.map((f) => (matches(e, f) ? "1" : "0")).join("") + (isEffect ? `#${e.id}` : "");
    const k = bySig.get(sig) ?? { n: 0, sig, members: [] };
    k.n += e.copies; k.members.push(e.id);
    if (fx.search[e.id]) k.usedUp = fx.search[e.id].usedUp ?? true;
    if (fx.excavate[e.id]) k.excavate = fx.excavate[e.id];
    bySig.set(sig, k);
  }
  const classes = [...bySig.values()];
  const fIdx = new Map(fl.map((f, i) => [f, i]));
  const classesFor = (f: Filter) => classes.map((k, i) => (k.sig[fIdx.get(f)!] === "1" ? i : -1)).filter((i) => i >= 0);
  for (const k of classes) {
    const id = k.members[0];
    if (fx.search[id] && k.members.length === 1) {
      k.searchTarget = classesFor(fx.search[id].target);
      if (fx.search[id].cost) k.costCls = classesFor(fx.search[id].cost!);
      k.putBack = fx.search[id].putBack;
    }
  }
  return { classes, classesFor };
}

// ---------- matching with distinct copies ----------
function lineMet(h: number[], reqs: { cls: number[]; min: number; max?: number }[]): boolean {
  for (const r of reqs) {
    if (r.max !== undefined) {
      let t = 0; for (const c of r.cls) t += h[c];
      if (t > r.max) return false;
    }
  }
  const avail = h.slice();
  const take = (i: number): boolean => {
    if (i === reqs.length) return true;
    const { cls, min } = reqs[i];
    const go = (j: number, need: number): boolean => {
      if (need === 0) return take(i + 1);
      if (j === cls.length) return false;
      const c = cls[j];
      for (let k = Math.min(avail[c], need); k >= 0; k--) {
        avail[c] -= k;
        const ok = go(j + 1, need - k);
        avail[c] += k;
        if (ok) return true;
      }
      return false;
    };
    return go(0, min);
  };
  return take(0);
}

type CReq = { cls: number[]; min: number; max?: number; from: Zone };
/** A line compiled for speed. "Anywhere" requirements are already gone (see reduceAny). */
interface CLine { hand: CReq[]; deck: CReq[]; sh: [number, number][] | null; sd: [number, number][] | null; dead: boolean }

function compileLine(reqs: CReq[], dead: boolean): CLine {
  const hand = reqs.filter((r) => r.from === "hand");
  const deck = reqs.filter((r) => r.from === "deck");
  // Fast path: every requirement is exactly one class with no maximum -> just compare counts.
  const simple = (rs: CReq[]): [number, number][] | null => {
    if (rs.some((r) => r.cls.length !== 1 || r.max !== undefined)) return null;
    const m = new Map<number, number>();
    for (const r of rs) m.set(r.cls[0], (m.get(r.cls[0]) ?? 0) + r.min);
    return [...m];
  };
  return { hand, deck, sh: simple(hand), sd: simple(deck), dead };
}

/** Hand-zone requirements are matched against the hand, deck-zone ones against the rest of the Deck; each uses different copies. */
function lineLive(h: number[], rem: number[], l: CLine): boolean {
  if (l.dead) return false;
  if (l.sh) { for (let i = 0; i < l.sh.length; i++) if (h[l.sh[i][0]] < l.sh[i][1]) return false; }
  else if (!lineMet(h, l.hand)) return false;
  if (l.sd) { for (let i = 0; i < l.sd.length; i++) if (rem[l.sd[i][0]] < l.sd[i][1]) return false; }
  else if (l.deck.length && !lineMet(rem, l.deck)) return false;
  return true;
}

// ---------- public API ----------
/**
 * "Anywhere in the 40" requirements don't depend on which cards you drew (hand + Deck is always the
 * whole deck), so check them once per line and drop them. A line that can't be satisfied is dead.
 */
function reduceAny(deck: DeckEntry[], goals: Goal[]): { goals: Goal[]; dead: boolean[][] } {
  const entries = deck.filter((e) => e.copies > 0);
  const counts = entries.map((e) => e.copies);
  const dead: boolean[][] = [];
  const out = goals.map((g) => {
    const d: boolean[] = [];
    const lines = g.lines.map((l, li) => {
      const any = l.reqs.filter((r) => (r.from ?? "hand") === "any");
      d[li] = any.length > 0 && !lineMet(counts, any.map((r) => ({ cls: entries.map((e, i) => (matches(e, r.match) ? i : -1)).filter((i) => i >= 0), min: r.min })));
      return { ...l, reqs: l.reqs.filter((r) => (r.from ?? "hand") !== "any") };
    });
    dead.push(d);
    return { ...g, lines };
  });
  return { goals: out, dead };
}

export function evaluate(deck: DeckEntry[], goalsIn: Goal[], fx: Effects = NO_EFFECTS, opts: { perLine?: boolean } = {}): GoalResult[] {
  const { goals, dead } = reduceAny(deck, goalsIn);
  const { classes, classesFor } = buildClasses(deck, goals, fx);
  const n = classes.map((k) => k.n);
  const N = n.reduce((a, b) => a + b, 0);
  const searchers = classes.map((k, i) => (k.searchTarget ? i : -1)).filter((i) => i >= 0);
  const excavators = classes.map((k, i) => (k.excavate ? i : -1)).filter((i) => i >= 0);

  return goals.map((goal, gi) => {
    // dead lines (an "anywhere" requirement is impossible) can never be met: give them an impossible requirement
    const lines: CLine[] = goal.lines.map((l, li) =>
      compileLine(l.reqs.map((r) => ({ cls: classesFor(r.match), min: r.min, max: r.max, from: (r.from ?? "hand") as Zone })), dead[gi][li]));

    // Which classes can matter at all? Fetching / moving anything else can never turn a failing hand into a live one.
    const useful = new Array(classes.length).fill(false);   // helps if it is in HAND
    const deckReq = new Array(classes.length).fill(false);  // matters if it stays in the DECK
    for (const l of lines) {
      if (l.dead) continue;
      for (const r of l.hand) for (const c of r.cls) useful[c] = true;
      for (const r of l.deck) for (const c of r.cls) deckReq[c] = true;
    }
    for (const s of searchers) { useful[s] = true; for (const c of classes[s].costCls ?? []) useful[c] = true; }

    // Quick "can any fetch possibly help?" test (a necessary condition, so it can only skip hopeless hands).
    const tgt: boolean[][] = searchers.map((s) => { const a = new Array(classes.length).fill(false); for (const t of classes[s].searchTarget!) if (useful[t]) a[t] = true; return a; });
    // If a fetch can bring another fetcher into hand the simple count below isn't safe: skip the shortcut.
    const chain = searchers.some((_, si) => searchers.some((s2) => tgt[si][s2]));
    const maybeLive = (h: number[], rem: number[], l: CLine, mask: number, bonus: number): boolean => {
      if (l.dead) return false;
      // Fetching only ever takes cards OUT of the Deck. Only a put-back can add one, so without one a missing deck requirement is final.
      if (l.sd) {
        let canPut = false;
        for (let si = 0; si < searchers.length; si++) if ((mask & (1 << si)) && h[searchers[si]] > 0 && classes[searchers[si]].putBack) { canPut = true; break; }
        if (!canPut) for (let i = 0; i < l.sd.length; i++) if (rem[l.sd[i][0]] < l.sd[i][1]) return false;
      }
      let deficit = 0;
      for (const r of l.hand) {
        let have = 0; for (const c of r.cls) have += h[c];
        if (have >= r.min) continue;
        let extra = 0;
        for (let si = 0; si < searchers.length; si++) {
          if ((mask & (1 << si)) && h[searchers[si]] > 0 && r.cls.some((c) => tgt[si][c])) extra++;
        }
        deficit += r.min - have - extra > 0 ? r.min - have - extra : 0;
        if (deficit > bonus) return false;
      }
      return true;
    };
    const avoid = (goal.avoid ?? []).map((r) => ({ cls: classesFor(r.match), max: r.max ?? 0 }));
    const H = goal.handSize;
    if (H > N || lines.length === 0) return { p: 0, perLine: lines.map(() => 0) };

    /** Can line set `ls` be reached from hand h, using searchers in `canSearch` (bitmask by index into searchers)? */
    const viaSearch = (h: number[], rem: number[], ls: typeof lines, canSearch: number): boolean => {
      if (ls.some((l) => lineLive(h, rem, l))) return true;
      if (!chain && !ls.some((l) => maybeLive(h, rem, l, canSearch, 0))) return false;
      for (let si = 0; si < searchers.length; si++) {
        const s = searchers[si];
        if (!(canSearch & (1 << si)) || h[s] === 0) continue;
        const k = classes[s];
        const next = canSearch & ~(1 << si);
        /** after the search resolved: optionally put one hand card back on top of the Deck, then recurse */
        const after = (): boolean => {
          if (!k.putBack) return viaSearch(h, rem, ls, next);
          // Dominance: putting back a useless card (not in any requirement) is never worse than putting back a useful one.
          // The only thing worth trying instead is a card that must be in the DECK (Photon Emperor — the rescue).
          // If the hand has no useless card, every card is tried.
          let hasJunk = false;
          for (let c = 0; c < h.length; c++) if (h[c] > 0 && !useful[c] && !deckReq[c]) { hasJunk = true; break; }
          let triedJunk = false;
          for (let c = 0; c < h.length; c++) {
            if (h[c] === 0) continue;
            const junk = !useful[c] && !deckReq[c];
            if (junk) { if (triedJunk) continue; triedJunk = true; }
            else if (hasJunk && !deckReq[c]) continue;
            h[c]--; rem[c]++;
            const ok = viaSearch(h, rem, ls, next);
            h[c]++; rem[c]--;
            if (ok) return true;
          }
          return false;
        };
        const doSearch = (t: number): boolean => {
          h[t]++; rem[t]--; if (k.usedUp) h[s]--;
          const ok = after();
          h[t]--; rem[t]++; if (k.usedUp) h[s]++;
          return ok;
        };
        for (const t of k.searchTarget!) {
          if (rem[t] === 0 || !useful[t]) continue;
          if (!k.costCls) { if (doSearch(t)) return true; continue; }
          for (const c of k.costCls) {
            if (h[c] < (c === s ? 2 : 1)) continue; // can't pay with the searcher itself
            h[c]--;
            const ok = doSearch(t);
            h[c]++;
            if (ok) return true;
          }
        }
      }
      return false;
    };

    /** P(success | opening hand h) for the given lines, including searches and one excavation. */
    const successP = (h: number[], ls: typeof lines): number => {
      const rem = n.map((x, i) => x - h[i]);
      const allSearch = (1 << searchers.length) - 1;
      if (ls.some((l) => lineLive(h, rem, l))) return 1;
      const hasDig = excavators.some((x) => h[x] > 0) ? 1 : 0;
      if ((chain || ls.some((l) => maybeLive(h, rem, l, allSearch, 0))) && viaSearch(h, rem, ls, allSearch)) return 1;
      if (!hasDig || (!chain && !ls.some((l) => maybeLive(h, rem, l, allSearch, 1)))) return 0;
      let best = 0;
      for (const x of excavators) {
        if (h[x] === 0) continue;
        const dig = classes[x].excavate!;
        const R = rem.reduce((a, b) => a + b, 0);
        if (R < dig) continue;
        h[x]--;
        // only searchers already in hand may act after the excavation
        let held = 0; searchers.forEach((s, si) => { if (h[s] > 0) held |= 1 << si; });
        let good = 0;
        for (let t = 0; t < classes.length; t++) {
          if (rem[t] === 0 || !useful[t]) continue;
          h[t]++; rem[t]--;
          if (viaSearch(h, rem, ls, held)) good += rem[t] + 1;
          h[t]--; rem[t]++;
        }
        h[x]++;
        const pMiss = good >= R ? 0 : Math.exp(lnChoose(R - good, dig) - lnChoose(R, dig));
        best = Math.max(best, 1 - pMiss);
      }
      return best;
    };

    const lnTotal = lnChoose(N, H);
    let p = 0;
    const perLine = new Array(lines.length).fill(0);
    const h = new Array(classes.length).fill(0);
    const suffix = new Array(classes.length + 1).fill(0);
    for (let i = classes.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + n[i];

    const rec = (i: number, left: number, lnW: number) => {
      if (i === classes.length) {
        if (left) return;
        const w = Math.exp(lnW - lnTotal);
        if (avoid.some((a) => a.cls.reduce((s, c) => s + h[c], 0) > a.max)) return;
        p += w * successP(h, lines);
        if (opts.perLine) lines.forEach((l, li) => { perLine[li] += w * successP(h, [l]); });
        return;
      }
      if (left > suffix[i]) return;
      for (let k = 0; k <= Math.min(n[i], left); k++) {
        h[i] = k;
        rec(i + 1, left - k, lnW + lnChoose(n[i], k));
      }
      h[i] = 0;
    };
    rec(0, H, 0);
    return { p, perLine };
  });
}

/** Number of distinct classes — handy for performance checks / debugging. */
export const classCount = (deck: DeckEntry[], goals: Goal[], fx: Effects = NO_EFFECTS) => buildClasses(deck, goals, fx).classes.length;
