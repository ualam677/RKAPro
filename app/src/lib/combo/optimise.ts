import { Effects, evaluate, Goal } from "./engine";
import { DeckEntry } from "./filters";

/**
 * Card-level ratio suggestions.
 *
 * Score = Σ weight × P(goal). We measure the effect of every single change
 * (−1 copy of a Main card, +1 copy of a Main or Side card). Cards whose single
 * change scores identically are interchangeable for your goals (e.g. two "Other"
 * cards), so they're grouped: "cut one of A / B". The best removal/addition groups
 * are combined into swaps and each swap is re-checked exactly, because effects
 * (searchers, Prosperity) interact.
 */
export interface Weighted { goal: Goal; weight: number }
export interface Change { outs: number[]; ins: number[]; deckSize: number; score: number; probs: number[] }

export interface OptimiseOpts {
  minSize?: number;                    // default 40
  maxCopies?: (id: number) => number;  // banlist-aware cap, default 3
  verifyTop?: number;                  // swaps re-checked exactly, default 10
  keep?: (id: number) => boolean;      // pinned cards are never cut
}

export const withChange = (deck: DeckEntry[], pool: DeckEntry[], out?: number, inn?: number): DeckEntry[] => {
  const d = deck.map((e) => ({ ...e }));
  if (out !== undefined) { const e = d.find((x) => x.id === out)!; e.copies--; }
  if (inn !== undefined) {
    const e = d.find((x) => x.id === inn);
    if (e) e.copies++; else d.push({ ...pool.find((x) => x.id === inn)!, copies: 1 });
  }
  return d;
};

export function scoreDeck(deck: DeckEntry[], goals: Weighted[], fx: Effects) {
  const probs = evaluate(deck, goals.map((g) => g.goal), fx).map((r) => r.p);
  return { probs, score: goals.reduce((s, g, i) => s + g.weight * probs[i], 0) };
}

/** Group ids whose delta is (numerically) identical. */
function cluster(deltas: Map<number, number>): { ids: number[]; d: number }[] {
  const out: { ids: number[]; d: number }[] = [];
  for (const [id, d] of [...deltas].sort((a, b) => b[1] - a[1])) {
    const g = out.find((x) => Math.abs(x.d - d) < 1e-9);
    if (g) g.ids.push(id); else out.push({ ids: [id], d });
  }
  return out;
}

export function* suggestChanges(
  deck: DeckEntry[], side: DeckEntry[], goals: Weighted[], fx: Effects, opts: OptimiseOpts = {},
): Generator<{ progress: number }, { base: Change; changes: Change[] }> {
  const minSize = opts.minSize ?? 40;
  const cap = opts.maxCopies ?? (() => 3);
  const verifyTop = opts.verifyTop ?? 10;
  const size = deck.reduce((s, e) => s + e.copies, 0);
  const base: Change = { outs: [], ins: [], deckSize: size, ...scoreDeck(deck, goals, fx) };

  const outs = deck.filter((e) => e.copies > 0 && !opts.keep?.(e.id)).map((e) => e.id);
  const ins = [...new Set([...deck.map((e) => e.id), ...side.map((e) => e.id)])]
    .filter((id) => (deck.find((e) => e.id === id)?.copies ?? 0) < cap(id));
  const total = outs.length + ins.length + verifyTop;
  let done = 0;

  const dOut = new Map<number, number>(), dIn = new Map<number, number>();
  const outScores = new Map<number, ReturnType<typeof scoreDeck>>();
  for (const id of outs) {
    const s = scoreDeck(withChange(deck, side, id), goals, fx);
    dOut.set(id, s.score - base.score); outScores.set(id, s);
    yield { progress: ++done / total };
  }
  for (const id of ins) {
    dIn.set(id, scoreDeck(withChange(deck, side, undefined, id), goals, fx).score - base.score);
    yield { progress: ++done / total };
  }

  const outG = cluster(dOut), inG = cluster(dIn);
  const changes: Change[] = [];

  // Plain cuts (only while staying at or above the minimum size)
  if (size - 1 >= minSize) {
    for (const g of outG) {
      const s = outScores.get(g.ids[0])!;
      changes.push({ outs: g.ids, ins: [], deckSize: size - 1, ...s });
    }
  }

  // Swaps: estimate from single deltas, verify the best group pairs exactly
  const est: { o: (typeof outG)[0]; i: (typeof inG)[0]; e: number }[] = [];
  for (const o of outG) for (const i of inG) est.push({ o, i, e: o.d + i.d });
  est.sort((a, b) => b.e - a.e);
  let verified = 0;
  for (const { o, i } of est) {
    if (verified >= verifyTop) break;
    const out = o.ids[0];
    const inn = i.ids.find((x) => x !== out);
    if (inn === undefined) continue;
    const s = scoreDeck(withChange(deck, side, out, inn), goals, fx);
    changes.push({ outs: o.ids.filter((x) => x !== inn), ins: i.ids.filter((x) => x !== out), deckSize: size, ...s });
    verified++;
    yield { progress: ++done / total };
  }

  return { base, changes: changes.filter((c) => c.score > base.score + 1e-4).sort((a, b) => b.score - a.score) };
}

/**
 * Greedy trim: repeatedly cut the single copy whose removal scores best,
 * until the deck reaches `target` cards.
 */
export function* trimTo(
  deck: DeckEntry[], goals: Weighted[], fx: Effects, target = 40, keep: (id: number) => boolean = () => false,
): Generator<{ progress: number }, { cuts: number[]; steps: { pick: number; tied: number[] }[]; probs: number[]; score: number }> {
  let d = deck.map((e) => ({ ...e }));
  const cuts: number[] = [];
  const picks: { pick: number; tied: number[] }[] = [];
  let size = d.reduce((s, e) => s + e.copies, 0);
  const steps = Math.max(1, size - target);
  let last = scoreDeck(d, goals, fx);
  for (let step = 0; size > target; step++, size--) {
    let best: { id: number; s: ReturnType<typeof scoreDeck> } | null = null;
    const cands = d.filter((e) => e.copies > 0 && !keep(e.id));
    if (!cands.length) break;
    const scored: { id: number; s: ReturnType<typeof scoreDeck> }[] = [];
    for (let i = 0; i < cands.length; i++) {
      const s = scoreDeck(withChange(d, [], cands[i].id), goals, fx);
      scored.push({ id: cands[i].id, s });
      if (!best || s.score > best.s.score + 1e-9) best = { id: cands[i].id, s };
      yield { progress: (step + (i + 1) / cands.length) / steps };
    }
    // every card whose cut scores the same is interchangeable for these goals — report them all
    const tied = scored.filter((x) => x.s.score > best!.s.score - 1e-9).map((x) => x.id);
    d = withChange(d, [], best!.id);
    cuts.push(best!.id);
    picks.push({ pick: best!.id, tied });
    last = best!.s;
  }
  return { cuts, steps: picks, probs: last.probs, score: last.score };
}

export function runSync<T>(g: Generator<unknown, T>): T {
  for (;;) { const r = g.next(); if (r.done) return r.value; }
}
export const suggestChangesSync = (...a: Parameters<typeof suggestChanges>) => runSync(suggestChanges(...a));
