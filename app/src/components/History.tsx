import { Version } from "../lib/history";

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const LOWER_IS_BETTER = /brick/i;
const when = (t: number) => new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Newest first. Each row shows its numbers and the change against the version before it. */
export function History({ versions, onRestore, onClear }: { versions: Version[]; onRestore: (v: Version) => void; onClear: () => void }) {
  if (versions.length === 0) return null;
  const labels = [...new Set(versions.flatMap((v) => Object.keys(v.stats)))];
  return (
    <section className="panel" data-testid="history">
      <h2>Deck history <span className="muted">· {versions.length} version{versions.length === 1 ? "" : "s"} · saved on every edit</span></h2>
      <div className="scroll-x">
        <table className="marginals">
          <thead><tr><th>When</th><th>Change</th>{labels.map((l) => <th key={l}>{l}</th>)}<th></th></tr></thead>
          <tbody>
            {versions.map((v, i) => ({ v, prev: versions[i - 1] })).reverse().map(({ v, prev }, row) => (
              <tr key={v.t} className={row === 0 ? "now" : ""}>
                <td className="muted">{when(v.t)}</td>
                <td>{v.note}</td>
                {labels.map((l) => {
                  const x = v.stats[l], p = prev?.stats[l];
                  if (x === undefined) return <td key={l} className="muted">·</td>;
                  const d = p === undefined || v.note.startsWith("Imported") ? 0 : (x - p) * 100;
                  return <td key={l}>{pct(x)} {Math.abs(d) >= 0.05 && <span className={(d > 0) !== LOWER_IS_BETTER.test(l) ? "up" : "down"}>{d > 0 ? "+" : ""}{d.toFixed(1)}</span>}</td>;
                })}
                <td>{row === 0 ? <span className="muted small">current</span> : <button className="link" onClick={() => onRestore(v)}>Restore</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="link" onClick={onClear}>Clear history</button>
    </section>
  );
}
