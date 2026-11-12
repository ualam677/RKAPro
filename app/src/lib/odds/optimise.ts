import { Goal, probability, RoleCounts } from "./hypergeo";

/**
 * Ratio optimiser (stage 1): try every count for the roles you allow to flex,
 * fill the rest of the deck with "Other", and rank builds by a weighted score.
 *
 * Objectives let you weigh going first vs going second separately, e.g.
 *   { goal: "Playable combo", handSize: 5, weight: 0.5 }
 *   { goal: "Interaction",    handSize: 6, weight: 0.5 }
 */
export interface Objective { goal: Goal; handSize: number; weight: number }
export interface FlexRole { role: string; min: number; max: number }

export interface OptimiseInput {
  fixed: RoleCounts;               // roles you don't want changed
  flex: FlexRole[];                // roles to search over
  deckSize: { min: number; max: number };
  /**
   * Role that absorbs leftover slots (default "Other"). Pass null to keep the
   * fixed roles untouched — then deck size = fixed + flex and slots are traded
   * between the flex roles only (safer: "Other" is usually your engine).
   */
  fillerRole?: string | null;
  objectives: Objective[];
  /** Current counts — among near-equal scores, builds with fewer changes rank first. */
  baseline?: RoleCounts;
  top?: number;
}

export interface Build { counts: RoleCounts; deckSize: number; score: number; breakdown: Record<string, number> }

export function optimise(input: OptimiseInput): Build[] {
  const filler = input.fillerRole === undefined ? "Other" : input.fillerRole;
  const fixedTotal = Object.entries(input.fixed).filter(([r]) => r !== filler).reduce((s, [, n]) => s + n, 0);
  const changes = (c: RoleCounts) =>
    input.baseline ? Object.keys(c).reduce((s, r) => s + Math.abs((c[r] ?? 0) - (input.baseline![r] ?? 0)), 0) : 0;
  const results: Build[] = [];
  const flexCounts: number[] = new Array(input.flex.length).fill(0);

  const evaluate = () => {
    const flexTotal = flexCounts.reduce((a, b) => a + b, 0);
    for (let size = input.deckSize.min; size <= input.deckSize.max; size++) {
      const fill = size - fixedTotal - flexTotal;
      if (fill < 0 || (filler === null && fill !== 0)) continue;
      const counts: RoleCounts = filler === null ? { ...input.fixed } : { ...input.fixed, [filler]: fill };
      input.flex.forEach((f, i) => { counts[f.role] = flexCounts[i]; });
      const breakdown: Record<string, number> = {};
      let score = 0;
      for (const o of input.objectives) {
        const p = probability(counts, o.handSize, o.goal);
        breakdown[`${o.goal.name} (${o.handSize})`] = p;
        score += o.weight * p;
      }
      results.push({ counts, deckSize: size, score, breakdown });
    }
  };

  const rec = (i: number) => {
    if (i === input.flex.length) return evaluate();
    for (let k = input.flex[i].min; k <= input.flex[i].max; k++) { flexCounts[i] = k; rec(i + 1); }
  };
  rec(0);

  // Scores within 0.05 percentage points count as a tie → prefer the smaller edit.
  results.sort((a, b) => (Math.abs(b.score - a.score) > 5e-4 ? b.score - a.score : changes(a.counts) - changes(b.counts)));
  return results.slice(0, input.top ?? 10);
}
