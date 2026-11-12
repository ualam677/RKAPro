import { useMemo, useState } from "react";
import { Requirement } from "../lib/combo/engine";
import { DeckEntry, describe, Filter, matches } from "../lib/combo/filters";
import { isMonster } from "../lib/cards/db";
import { Route, routeFromLearned } from "../lib/combo/setup";
import { LearnedLine, learnLine, parseOmegaReplay } from "../lib/replay/omega";

interface Props {
  main: DeckEntry[];
  side: DeckEntry[];
  extraIds: number[];
  nameOf: (id: number) => string;
  onApply: (starter: number, route: Route) => void;
  /** The starter's existing "needs" (e.g. Galaxy Soldier: a LIGHT monster in hand) — used as the default generalisation. */
  needsOf: (starter: number) => Requirement[];
}

/** Ways to read "you had THIS card in hand": the exact card, or any card sharing a property with it. */
export function generalisations(e: DeckEntry | undefined, id: number, nameOf: (id: number) => string): { value: Filter; label: string }[] {
  const out: Filter[] = [`card:${id}`];
  const c = e?.card;
  if (c) {
    if (isMonster(c)) {
      if (c.attribute) out.push(`attr:${c.attribute}`);
      if (c.attribute && c.level) out.push(`attr:${c.attribute}+level:${c.level}`);
      if (c.level) out.push(`level:${c.level}`);
      if (c.race) out.push(`race:${c.race}`);
      out.push("kind:monster");
    } else out.push(`kind:${c.kind}`);
    for (const w of new Set(c.name.split(/[\s\-:,]+/).filter((w) => w.length >= 4 && /^[A-Z]/.test(w)))) out.push(`name:${w}`);
    out.push("any");
  }
  return out.map((value) => ({ value, label: value.startsWith("card:") ? `exactly ${nameOf(id)}` : `any ${describe(value, nameOf)}` }));
}

const ZONE_TEXT: Record<string, string> = { hand: "In your opening hand", deck: "Must still be in the Deck", any: "Must be somewhere in your 40" };

export function ReplayPanel({ main, side, extraIds, nameOf, onApply, needsOf }: Props) {
  const [general, setGeneral] = useState<Record<number, Filter>>({});
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [line, setLine] = useState<LearnedLine | null>(null);
  const [starter, setStarter] = useState<number | null>(null);
  const [routeName, setRouteName] = useState("");
  const [showSteps, setShowSteps] = useState(false);
  const [added, setAdded] = useState("");

  // replay passcodes -> the passcode your deck uses for that card (alt arts)
  const canon = useMemo(() => {
    const byName = new Map<string, number>();
    for (const e of [...main, ...side]) byName.set(e.card.name, e.id);
    return (c: number) => byName.get(nameOf(c)) ?? c;
  }, [main, side, nameOf]);

  function read() {
    setErr(""); setAdded(""); setGeneral({});
    try {
      const l = learnLine(parseOmegaReplay(text), nameOf);
      setLine(l);
      const first = l.handUsed.map(canon).find((c) => main.some((e) => e.id === c)) ?? l.handUsed[0] ?? null;
      setStarter(first !== undefined ? canon(first) : null);
      setRouteName(l.searched.size || l.fromDeck.size ? `via ${nameOf(
        [...l.searched.keys(), ...l.fromDeck.keys()].map(canon).find((c) => c !== (first && canon(first))) ?? 0)}` : "replay");
    } catch (e) {
      setLine(null); setErr((e as Error).message);
    }
  }

  const entryOf = (id: number) => [...main, ...side].find((e) => e.id === id);
  // Default: if the starter already says "needs a LIGHT monster in hand" and this card is one, read it that way.
  const defaultFor = (id: number): Filter => {
    const e = entryOf(id);
    const rule = starter !== null && e ? needsOf(starter).find((r) => (r.from ?? "hand") === "hand" && matches(e, r.match)) : undefined;
    return rule?.match ?? `card:${id}`;
  };
  const route: Route | null = useMemo(() => {
    if (!line || starter === null) return null;
    const r = routeFromLearned(line, starter, routeName || "replay", canon);
    const orig: Record<number, number> = {};
    const reqs = r.reqs.map((q, qi) => {
      if ((q.from ?? "hand") !== "hand" || !q.match.startsWith("card:")) return q;
      const id = Number(q.match.slice(5));
      orig[qi] = id;
      return { ...q, match: general[id] ?? defaultFor(id) };
    });
    return { ...r, reqs, orig };
  }, [line, starter, routeName, canon, general]); // eslint-disable-line react-hooks/exhaustive-deps
  const inMain = new Set(main.filter((e) => e.copies > 0).map((e) => e.id));
  const extraNames = new Set(extraIds.map(nameOf));
  const reqId = (r: Requirement) => Number(r.match.slice(5));
  const missingMain = route ? route.reqs.filter((r) => r.match.startsWith("card:") && !inMain.has(reqId(r))).map((r) => nameOf(reqId(r))) : [];
  const missingExtra = line ? [...new Set(line.extraUsed.map(nameOf))].filter((n) => !extraNames.has(n)) : [];

  return (
    <section className="panel">
      <h2>Teach it a combo from a replay</h2>
      <p className="muted">
        In <b>YGO Omega</b>, open a replay and press <b>Export</b>, then paste it here. Best: a solo test with the Start Hand set to just your starter(s).
        It reads your first turn and works out which cards had to be in hand, which had to stay in the Deck, and which only had to be in your 40.
      </p>
      <textarea rows={3} value={text} placeholder="Paste the Omega replay export…" onChange={(e) => setText(e.target.value)} />
      <div className="row">
        <button onClick={read} disabled={!text.trim()}>Read replay</button>
        {added && <span className="up">{added}</span>}
      </div>
      {err && <p className="error">{err}</p>}

      {line && route && (
        <div className="replay">
          <div className="row">
            <span className="muted">Opening hand used:</span> <b>{line.handUsed.map(nameOf).join(", ") || "—"}</b>
            {line.handUnused.length > 0 && <span className="muted small">(not used: {line.handUnused.map(nameOf).join(", ")})</span>}
          </div>
          <div className="row">
            <span className="muted">Starter</span>
            <select value={starter ?? ""} onChange={(e) => setStarter(Number(e.target.value))}>
              {[...new Set(line.handUsed.map(canon))].map((c) => <option key={c} value={c}>{nameOf(c)}</option>)}
            </select>
            <span className="muted">route name</span>
            <input className="text" value={routeName} onChange={(e) => setRouteName(e.target.value)} />
          </div>

          {line && (() => {
            const handCards = [...new Set(routeFromLearned(line, starter!, "x", canon).reqs.filter((r) => (r.from ?? "hand") === "hand").map((r) => Number(r.match.slice(5))))];
            return handCards.length ? (
              <div className="req-group">
                <div className="muted small">Other cards you had in hand — how should the app read them?</div>
                {handCards.map((id) => (
                  <div key={id} className="need">
                    <span className="pill z-hand">{nameOf(id)}</span>
                    <span className="muted">counts as</span>
                    <select value={general[id] ?? defaultFor(id)} onChange={(e) => setGeneral({ ...general, [id]: e.target.value })}>
                      {generalisations(entryOf(id), id, nameOf).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                ))}
                <div className="muted small">E.g. Galaxy Soldier discarding a Delta Wing really means “any LIGHT monster”.</div>
              </div>
            ) : null;
          })()}
          {(["hand", "deck", "any"] as const).map((z) => {
            const rs = route.reqs.filter((r) => (r.from ?? "hand") === z);
            if (z === "hand") rs.unshift({ match: `card:${starter}`, min: 1, from: "hand" });
            return rs.length ? (
              <div key={z} className="req-group">
                <div className="muted small">{ZONE_TEXT[z]}</div>
                <div className="chips">{rs.map((r, i) => <span key={i} className={`pill z-${z}`}>{r.min > 1 ? `${r.min}× ` : ""}{r.match.startsWith("card:") ? nameOf(reqId(r)) : `any ${describe(r.match, nameOf)}`}</span>)}</div>
              </div>
            ) : null;
          })}
          {line.extraUsed.length > 0 && (
            <div className="req-group">
              <div className="muted small">Extra Deck used</div>
              <div className="chips">{[...new Set(line.extraUsed)].map((c) => <span key={c} className="pill z-extra">{nameOf(c)}</span>)}</div>
            </div>
          )}
          {line.endBoard.length > 0 && <p className="small"><span className="muted">End of turn on board:</span> {line.endBoard.map((b) => nameOf(b.code)).join(", ")}</p>}
          {missingMain.length > 0 && <p className="warn">⚠ Not in your Main Deck: {[...new Set(missingMain)].join(", ")} — this route can't be live until you add {missingMain.length > 1 ? "them" : "it"}.</p>}
          {missingExtra.length > 0 && <p className="warn">⚠ Not in your Extra Deck: {missingExtra.join(", ")}.</p>}

          <button className="link" onClick={() => setShowSteps(!showSteps)}>{showSteps ? "▾" : "▸"} Play-by-play ({line.steps.length} steps)</button>
          {showSteps && <ol className="steps small">{line.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}

          <div className="row">
            <button disabled={starter === null} onClick={() => { onApply(starter!, route); setAdded(`Added “${route.name}” to ${nameOf(starter!)}`); }}>
              Add as a route for {starter !== null ? nameOf(starter) : "…"}
            </button>
            <span className="muted small">A starter can have several routes; it counts as live if any of them is.</span>
          </div>
        </div>
      )}
    </section>
  );
}
