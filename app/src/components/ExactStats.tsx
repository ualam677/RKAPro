import { useMemo, useState } from "react";
import { Counts, marginals, METRIC_KEYS, METRIC_LABELS, MetricKey, metrics, Model } from "../../../packages/analysis/odds.ts";
import model from "../../../packs/galaxy-eyes/lines.json";

const M = model as Model;
const MODEL_CARDS = new Set([...M.lines.flatMap((l) => l.needs.flatMap((n) => n.any ?? M.groups[n.group!] ?? []))]);
const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
/** For these, lower is better. */
const LOWER_IS_BETTER: MetricKey[] = ["brick1"];
const ROWS: { key: MetricKey | "ht2_1" | "combo2"; label: string; help: string }[] = [
  { key: "full1", label: "Going 1st: full board", help: `Best verified line ends on at least ${M.fullBoard} interruptions` },
  { key: "nib1", label: "Going 1st: Nibiru-proof full board", help: "Photon Lord or Tachyon Dragon + Transmigration by summon 5" },
  { key: "full_1ht", label: "Going 1st: full board + 1 hand trap", help: "Hand traps that are live on the opponent's turn" },
  { key: "full_2ht", label: "Going 1st: full board + 2 hand traps", help: "" },
  { key: "brick1", label: "Going 1st: brick (no line)", help: "No verified line in the 5 cards" },
  { key: "combo2", label: "Going 2nd: a full-board line in 6 cards", help: "" },
  { key: "ht2_1", label: "Going 2nd: at least 1 hand trap", help: "" },
  { key: "ht2_2", label: "Going 2nd: at least 2 hand traps", help: "" },
  { key: "ht2_3", label: "Going 2nd: at least 3 hand traps", help: "" },
  { key: "combo2_2ht", label: "Going 2nd: line + 2 hand traps", help: "" },
];

export const packApplies = (deck: Counts) => Object.keys(deck).some((n) => deck[n] > 0 && MODEL_CARDS.has(n));
/** The few numbers stored with each deck version. */
export const headline = (deck: Counts) => { const m = metrics(M, deck); return { full1: m.full1, nib1: m.nib1, full_2ht: m.full_2ht, brick1: m.brick1, ht2_2: m.ht2_2 }; };

function Delta({ d, lowerBetter }: { d: number; lowerBetter?: boolean }) {
  const v = d * 100; if (Math.abs(v) < 0.05) return <span className="muted">0.0</span>;
  return <span className={(v > 0) !== !!lowerBetter ? "up" : "down"}>{v > 0 ? "+" : ""}{v.toFixed(1)}</span>;
}

export function ExactStats({ deck, baseline, maxCopies }: { deck: Counts; baseline: Counts | null; maxCopies: (name: string) => number }) {
  const now = useMemo(() => metrics(M, deck), [deck]);
  const base = useMemo(() => (baseline ? metrics(M, baseline) : null), [baseline]);
  const changed = base && JSON.stringify(Object.entries(deck).filter(([, k]) => k > 0).sort()) !== JSON.stringify(Object.entries(baseline!).filter(([, k]) => k > 0).sort());
  const [marg, setMarg] = useState<{ key: string; data: ReturnType<typeof marginals> } | null>(null);
  const deckKey = JSON.stringify(deck);
  const lines = Object.entries(now.perLine).sort((a, b) => b[1] - a[1]);
  return (
    <section className="panel" data-testid="exact-stats">
      <h2>Exact stats <span className="muted">· engine-verified lines · {now.size} cards</span></h2>
      <p className="muted small">Every possible hand is counted and mapped to its best line that the engine has reproduced. These are lower bounds: a hand the model calls a brick may still have a play.</p>
      <table className="stats-table">
        <thead><tr><th></th><th>Now</th>{changed && <><th>As imported</th><th>Change</th></>}</tr></thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.key} title={r.help}>
              <td>{r.label}</td>
              <td><b>{pct(now[r.key])}</b></td>
              {changed && <><td className="muted">{pct(base![r.key])}</td><td><Delta d={now[r.key] - base![r.key]} lowerBetter={LOWER_IS_BETTER.includes(r.key as MetricKey)} /></td></>}
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Which line the hand plays (going 1st, best line per hand)</h3>
      <div className="bars">
        {lines.map(([name, p]) => (
          <div className="bar-row" key={name}><span>{name}</span><div className="bar"><div style={{ width: pct(p), background: "#2f9e44" }} /></div><b>{pct(p)}</b></div>
        ))}
        <div className="bar-row"><span>No line (brick)</span><div className="bar"><div style={{ width: pct(now.brick1), background: "#c92a2a" }} /></div><b>{pct(now.brick1)}</b></div>
      </div>
      <h3>Per-card value</h3>
      {marg?.key !== deckKey
        ? <button className="ghost" onClick={() => setTimeout(() => setMarg({ key: deckKey, data: marginals(M, deck, maxCopies) }), 0)}>Show what one copy less / one copy more of each card does</button>
        : (
          <div className="scroll-x">
            <table className="marginals">
              <thead><tr><th>Card</th>{METRIC_KEYS.map((k) => <th key={k}>{METRIC_LABELS[k]}</th>)}</tr></thead>
              <tbody>
                {marg.data.rows.map((r) => (
                  <tr key={r.name}>
                    <td>{r.copies}× {r.name}</td>
                    {METRIC_KEYS.map((k) => (
                      <td key={k}>
                        <Delta d={r.minus[k] - marg.data.base[k]} lowerBetter={LOWER_IS_BETTER.includes(k)} />
                        <span className="muted"> / </span>
                        {r.plus ? <Delta d={r.plus[k] - marg.data.base[k]} lowerBetter={LOWER_IS_BETTER.includes(k)} /> : <span className="muted">·</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">Each cell: change in percentage points with one copy less / one copy more (the deck gets one card smaller or larger). No single score: you weigh them.</p>
          </div>
        )}
    </section>
  );
}
