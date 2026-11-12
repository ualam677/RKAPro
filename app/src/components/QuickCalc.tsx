import { useEffect, useMemo, useState } from "react";
import { quick, QuickCard, QuickPick } from "../../../packages/analysis/quick.ts";

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const KEY = "rkapro-quick-v1";
interface Saved { pairs: [string, string][]; picks: QuickPick[] }
const load = (): Saved => { try { return { pairs: [], picks: [], ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return { pairs: [], picks: [] }; } };

/** Community-style calculator: exact odds from the tags on the card tiles, plus pairs and "open with" rules. */
export function QuickCalc({ cards }: { cards: QuickCard[] }) {
  const [saved, setSaved] = useState<Saved>(load);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* storage unavailable */ } }, [saved]);
  const names = cards.filter((c) => c.copies > 0).map((c) => c.name);
  const has = (n: string) => names.includes(n);
  const pairs = saved.pairs.filter(([a, b]) => has(a) && has(b)), picks = saved.picks.filter((p) => has(p.name));
  const res = useMemo(() => [5, 6].map((handSize) => quick({ cards, pairs, picks, handSize })), [cards, saved]); // eslint-disable-line react-hooks/exhaustive-deps
  const size = cards.reduce((s, c) => s + c.copies, 0);
  const count = (f: (c: QuickCard) => boolean | undefined) => cards.reduce((s, c) => s + (f(c) ? c.copies : 0), 0);
  const [a, setA] = useState(""); const [b, setB] = useState(""); const [pk, setPk] = useState("");
  const rows: [string, (r: (typeof res)[number]) => number][] = [
    ["At least 1 starter (or a complete pair)", (r) => r.anyStarter],
    ["2 plays that do not share the Normal Summon", (r) => r.twoPlays],
    ["No starter", (r) => r.noStarter],
    ["At least 1 hand trap", (r) => r.handTraps[0]],
    ["At least 2 hand traps", (r) => r.handTraps[1]],
    ["At least 3 hand traps", (r) => r.handTraps[2]],
    ["Starter + at least 1 hand trap", (r) => r.starterAnd1HT],
    ["Starter + at least 2 hand traps", (r) => r.starterAnd2HT],
    ["At least 1 brick", (r) => r.bricks[0]],
    ["At least 2 bricks", (r) => r.bricks[1]],
    ...pairs.map(([x, y], i): [string, (r: (typeof res)[number]) => number] => [`Pair: ${x} + ${y}`, (r) => r.pairs[i]]),
    ...picks.map((p, i): [string, (r: (typeof res)[number]) => number] => [`Open ${p.min === p.max ? p.min : `${p.min} to ${p.max}`} × ${p.name}`, (r) => r.picks[i]]),
    ...(picks.length > 1 ? [["All “open with” rules at once", (r: (typeof res)[number]) => r.allPicks] as [string, (r: (typeof res)[number]) => number]] : []),
  ];
  const Select = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}><option value="">pick a card…</option>{names.map((n) => <option key={n}>{n}</option>)}</select>
  );
  return (
    <section className="panel" data-testid="quick-calc">
      <h2>Quick calculator <span className="muted">· from your tags · works for any deck</span></h2>
      <p className="muted small">
        {size} cards: {count((c) => c.starter)} starters ({count((c) => c.starter && c.ns)} need the Normal Summon), {count((c) => c.handTrap)} hand traps, {count((c) => c.brick)} bricks.
        Tags come from the card tiles below (Starter, Hand Trap, Dead if drawn, Needs Normal Summon) and are remembered per card for the next deck.
      </p>
      <table className="stats-table">
        <thead><tr><th></th><th>5 cards (going 1st)</th><th>6 cards (going 2nd)</th></tr></thead>
        <tbody>{rows.map(([label, f]) => <tr key={label}><td>{label}</td><td><b>{pct(f(res[0]))}</b></td><td><b>{pct(f(res[1]))}</b></td></tr>)}</tbody>
      </table>
      <div className="row">
        <span className="muted small">2-card pair:</span><Select value={a} onChange={setA} /><span className="muted">+</span><Select value={b} onChange={setB} />
        <button className="ghost" disabled={!a || !b} onClick={() => { setSaved({ ...saved, pairs: [...saved.pairs, [a, b]] }); setA(""); setB(""); }}>Add pair</button>
        <span className="muted small">Open with:</span><Select value={pk} onChange={setPk} />
        <button className="ghost" disabled={!pk} onClick={() => { setSaved({ ...saved, picks: [...saved.picks, { name: pk, min: 1, max: 3 }] }); setPk(""); }}>Add rule</button>
      </div>
      {(pairs.length > 0 || picks.length > 0) && (
        <div className="row">
          {saved.pairs.map(([x, y], i) => has(x) && has(y) && <span key={`p${i}`} className="pill">{x} + {y} <button className="x" aria-label="remove pair" onClick={() => setSaved({ ...saved, pairs: saved.pairs.filter((_, j) => j !== i) })}>×</button></span>)}
          {saved.picks.map((p, i) => has(p.name) && (
            <span key={`k${i}`} className="pill">{p.name}: min <input className="num" type="number" min={0} max={3} value={p.min} onChange={(e) => setSaved({ ...saved, picks: saved.picks.map((q, j) => (j === i ? { ...q, min: Math.max(0, Math.min(q.max, Number(e.target.value) || 0)) } : q)) })} /> max <input className="num" type="number" min={0} max={3} value={p.max} onChange={(e) => setSaved({ ...saved, picks: saved.picks.map((q, j) => (j === i ? { ...q, max: Math.max(q.min, Math.min(3, Number(e.target.value) || 0)) } : q)) })} />
              <button className="x" aria-label="remove rule" onClick={() => setSaved({ ...saved, picks: saved.picks.filter((_, j) => j !== i) })}>×</button></span>
          ))}
        </div>
      )}
    </section>
  );
}
