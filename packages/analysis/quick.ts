// Quick, community-style calculator: exact odds from tags only (no lines needed). Works for any deck.
// Tags per card: starter, needs the Normal Summon, hand trap, brick. Plus 2-card pairs and "open with min..max copies".
import { Counts, enumerateHands } from "./odds.ts";

export interface QuickCard { name: string; copies: number; starter?: boolean; ns?: boolean; handTrap?: boolean; brick?: boolean }
export interface QuickPick { name: string; min: number; max: number }
export interface QuickInput { cards: QuickCard[]; pairs: [string, string][]; picks: QuickPick[]; handSize: number }
export interface QuickResult {
  /** at least one starter, or a complete pair */
  anyStarter: number;
  /** two plays that do not fight over the Normal Summon: distinct non-NS starters count one each, all NS starters together count one, each complete pair counts one */
  twoPlays: number;
  noStarter: number;
  /** [>=1, >=2, >=3] hand traps */
  handTraps: [number, number, number];
  starterAnd1HT: number; starterAnd2HT: number;
  /** [>=1, >=2] bricks */
  bricks: [number, number];
  /** each pair complete in hand, in input order */
  pairs: number[];
  /** each "open with min..max copies" rule, in input order, and all of them at once */
  picks: number[]; allPicks: number;
}

export function quick(input: QuickInput): QuickResult {
  const special = new Set<string>([...input.pairs.flat(), ...input.picks.map((p) => p.name)]);
  // merge cards the question cannot tell apart; non-NS starters stay separate (distinct names = distinct plays)
  const tag = new Map<string, QuickCard>(); const deck: Counts = {};
  for (const c of input.cards) {
    if (c.copies <= 0) continue;
    const key = special.has(c.name) || (c.starter && !c.ns) ? c.name : `#${c.starter ? "S" : ""}${c.ns ? "N" : ""}${c.handTrap ? "H" : ""}${c.brick ? "B" : ""}`;
    if (!tag.has(key)) tag.set(key, { ...c, name: key });
    deck[key] = (deck[key] ?? 0) + c.copies;
  }
  const r: QuickResult = { anyStarter: 0, twoPlays: 0, noStarter: 0, handTraps: [0, 0, 0], starterAnd1HT: 0, starterAnd2HT: 0, bricks: [0, 0],
    pairs: input.pairs.map(() => 0), picks: input.picks.map(() => 0), allPicks: 0 };
  const size = Object.values(deck).reduce((a, b) => a + b, 0);
  if (size < input.handSize) return r;
  for (const { h, p } of enumerateHands(deck, input.handSize)) {
    let plays = 0, ns = false, ht = 0, bricks = 0;
    for (const [k, n] of Object.entries(h)) {
      const t = tag.get(k)!;
      if (t.starter) { if (t.ns) ns = true; else plays++; }
      if (t.handTrap) ht += n; if (t.brick) bricks += n;
    }
    if (ns) plays++;
    input.pairs.forEach(([a, b], i) => {
      const ok = a === b ? (h[a] ?? 0) >= 2 : (h[a] ?? 0) >= 1 && (h[b] ?? 0) >= 1;
      if (ok) { r.pairs[i] += p; if (!tag.get(a)?.starter && !tag.get(b)?.starter) plays++; } // a pair of non-starters is a play of its own
    });
    if (plays >= 1) { r.anyStarter += p; if (ht >= 1) r.starterAnd1HT += p; if (ht >= 2) r.starterAnd2HT += p; } else r.noStarter += p;
    if (plays >= 2) r.twoPlays += p;
    for (let i = 0; i < 3; i++) if (ht > i) r.handTraps[i] += p;
    for (let i = 0; i < 2; i++) if (bricks > i) r.bricks[i] += p;
    let all = input.picks.length > 0;
    input.picks.forEach((q, i) => { const n = h[q.name] ?? 0; if (n >= q.min && n <= q.max) r.picks[i] += p; else all = false; });
    if (all) r.allPicks += p;
  }
  return r;
}
