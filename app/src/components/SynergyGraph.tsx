import { useMemo, useState } from "react";
import { Line, Zone } from "../lib/combo/engine";
import { describe } from "../lib/combo/filters";

/**
 * Starter lines (left) linked to the cards each one needs (right).
 * Edge colour = where the card must be. Click a card to see which lines it breaks if cut.
 */
interface Props {
  lines: Line[];
  perLine: number[];
  nameOf: (id: number) => string;
  copiesOf: (id: number) => number;
}

const ZONE_COL: Record<Zone, string> = { hand: "#2f9e44", deck: "#f0b429", any: "#4dabf7" };
const ZONE_TXT: Record<Zone, string> = { hand: "in hand", deck: "must stay in Deck", any: "in the 40" };
const pct = (p: number) => `${(p * 100).toFixed(0)}%`;

export function SynergyGraph({ lines, perLine, nameOf, copiesOf }: Props) {
  const [sel, setSel] = useState<string | null>(null);
  const [hoverLine, setHoverLine] = useState<number | null>(null);

  const { nodes, edges } = useMemo(() => {
    const nodes = new Map<string, { key: string; label: string; id?: number; users: number[] }>();
    const edges: { line: number; key: string; zone: Zone }[] = [];
    lines.forEach((l, li) => {
      l.reqs.slice(1).forEach((r) => {
        const isCard = /^card:\d+$/.test(r.match);
        const key = r.match;
        const label = (r.min > 1 ? `${r.min}× ` : "") + describe(r.match, nameOf);
        if (!nodes.has(key)) nodes.set(key, { key, label, id: isCard ? Number(r.match.slice(5)) : undefined, users: [] });
        const n = nodes.get(key)!;
        if (!n.users.includes(li)) n.users.push(li);
        edges.push({ line: li, key, zone: (r.from ?? "hand") as Zone });
      });
    });
    const sorted = [...nodes.values()].sort((a, b) => b.users.length - a.users.length || a.label.localeCompare(b.label));
    return { nodes: sorted, edges };
  }, [lines, nameOf]);

  if (!lines.length) return null;
  const ROW = 30, W = 960, LX = 300, RX = W - 330;
  const H = Math.max(lines.length, nodes.length) * ROW + 20;
  const ly = (i: number) => 20 + i * ((H - 30) / Math.max(1, lines.length - 1 || 1)) * (lines.length > 1 ? 1 : 0) + (lines.length === 1 ? H / 2 - 20 : 0);
  const ry = (i: number) => 20 + i * ROW;
  const nIdx = new Map(nodes.map((n, i) => [n.key, i]));
  const selNode = nodes.find((n) => n.key === sel);
  const active = (e: { line: number; key: string }) => (sel ? e.key === sel : hoverLine === null || e.line === hoverLine);

  return (
    <div className="synergy">
      <div className="legend-row small">
        {(Object.keys(ZONE_COL) as Zone[]).map((z) => <span key={z}><i style={{ background: ZONE_COL[z] }} />{ZONE_TXT[z]}</span>)}
        <span className="muted">· click a card to see what cutting it breaks</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Which cards each starter line needs">
        {edges.map((e, i) => {
          const y1 = ly(e.line), y2 = ry(nIdx.get(e.key)!);
          return <path key={i} d={`M${LX},${y1} C${(LX + RX) / 2},${y1} ${(LX + RX) / 2},${y2} ${RX},${y2}`}
            fill="none" stroke={ZONE_COL[e.zone]} strokeWidth={active(e) ? 2 : 1} opacity={active(e) ? 0.9 : 0.12} />;
        })}
        {lines.map((l, i) => (
          <g key={i} onMouseEnter={() => setHoverLine(i)} onMouseLeave={() => setHoverLine(null)} style={{ cursor: "default" }}>
            <circle cx={LX} cy={ly(i)} r={6} fill="#2f9e44" />
            <text x={LX - 12} y={ly(i) + 4} textAnchor="end" fontSize={12.5} fill={selNode && !selNode.users.includes(i) ? "#5c6370" : "#e9ecef"}>
              {l.name.length > 36 ? l.name.slice(0, 35) + "…" : l.name}
              <tspan fill="#8b93a1"> {pct(perLine[i] ?? 0)}</tspan>
            </text>
          </g>
        ))}
        {nodes.map((n, i) => (
          <g key={n.key} onClick={() => setSel(sel === n.key ? null : n.key)} style={{ cursor: "pointer" }}>
            <circle cx={RX} cy={ry(i)} r={6} fill={sel === n.key ? "#f0b429" : "#868e96"} />
            <text x={RX + 12} y={ry(i) + 4} fontSize={12.5} fill={sel && sel !== n.key ? "#8b93a1" : "#e9ecef"}>
              {n.label.length > 34 ? n.label.slice(0, 33) + "…" : n.label}
              <tspan fill="#8b93a1"> · {n.users.length} line{n.users.length > 1 ? "s" : ""}{n.id !== undefined ? ` · ${copiesOf(n.id)} in deck` : ""}</tspan>
            </text>
          </g>
        ))}
      </svg>
      {selNode && (
        <p className="small">
          <b>{selNode.label}</b> is needed by {selNode.users.length} of {lines.length} lines: {selNode.users.map((u) => lines[u].name).join(", ")}.
          {selNode.id !== undefined && copiesOf(selNode.id) <= 1 && <span className="warn"> You run 1 copy, so cutting it makes all of these impossible.</span>}
        </p>
      )}
    </div>
  );
}
