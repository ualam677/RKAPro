import { useState } from "react";
import { api, DrillResult } from "./api";

const pct = (p: number | null) => (p === null ? "·" : `${(p * 100).toFixed(1)}%`);
const VERDICT: Record<string, string> = { better: "Better than the stored line", matched: "Matched the stored line", below: "Below the stored line", "expected brick": "No line for this hand (as expected)" };
const step = (s: { k: string; name: string } | null) => (s ? `${s.k === "summon" ? "Summon" : "Activate"} ${s.name}` : "nothing (the turn ended)");

/** Post-drill review: several numbers side by side, and "why?" only where you left the stored line. */
export function Review({ result, onResult, onNext, onClose }: { result: DrillResult; onResult: (r: DrillResult) => void; onNext: () => void; onClose: () => void }) {
  const { grade: g, summary: s } = result;
  const [why, setWhy] = useState(""); const [msg, setMsg] = useState("");
  const dev = g.line?.deviation ?? null;
  // storing a weaker line is allowed (it is your call), but never by accident
  const sure = () => g.board.yours >= g.board.stored || window.confirm(`Your board (${g.board.yours}) is lower than the stored line's (${g.board.stored}). Store your line anyway? Later drills of this hand class will expect it.`);
  const yn = (b: boolean) => (b ? "yes" : "no");
  return (
    <div className="window review" role="dialog" aria-label="Drill review" data-testid="review">
      <h3>Drill review <button className="x" aria-label="Close" onClick={onClose}>×</button></h3>
      <div className={`verdict v-${g.verdict.replace(" ", "-")}`} data-testid="verdict">{VERDICT[g.verdict] ?? g.verdict}</div>
      <p className="small muted">Hand: {g.hand.join(", ")}. Hand class: <b>{g.class ?? "none"}</b> ({g.storedSource}).</p>
      <table className="stats-table">
        <thead><tr><th></th><th>You</th><th>Stored line</th></tr></thead>
        <tbody>
          <tr><td>Board (interruptions)</td><td><b>{g.board.yours}</b></td><td>{g.board.stored}</td></tr>
          <tr><td>Full board (3.25 or more)</td><td><b>{yn(g.board.full)}</b></td><td>{yn(g.board.storedFull)}</td></tr>
          <tr title={g.nibiru.why}><td>Nibiru-proof</td><td><b>{yn(g.nibiru.yours)}</b></td><td>{yn(g.nibiru.stored)}</td></tr>
          <tr><td>Hand traps still in hand</td><td><b>{g.handTrapsKept}</b></td><td className="muted">·</td></tr>
          <tr><td>Summons this turn</td><td><b>{g.summons}</b></td><td className="muted">·</td></tr>
          {g.line && <tr><td>Steps of the stored line you played</td><td><b>{g.line.followed} of {g.line.total}</b></td><td className="muted">{g.line.source}</td></tr>}
        </tbody>
      </table>
      <p className="small">{g.board.parts.length ? `Your board: ${g.board.parts.join(" · ")}` : "Your board has no interruption."} <span className="muted">{g.nibiru.why}.</span></p>

      {dev ? (
        <div className="deviation" data-testid="deviation">
          <p><b>You left the stored line at step {dev.at + 1}.</b> It plays <b>{step(dev.stored)}</b>; you played <b>{step(dev.yours)}</b>.</p>
          <textarea rows={2} aria-label="Why" placeholder="Why? (kept as a case, with this exact position)" value={why} onChange={(e) => setWhy(e.target.value)} />
          <div className="row">
            <button className="ghost" disabled={!why.trim()} onClick={async () => { await api.drillWhy(why.trim()); setWhy(""); setMsg("Saved as a case."); }}>Save my answer</button>
            <button className="ghost" disabled={!g.class} title="The next drill of this hand class will expect your line" onClick={async () => { if (!sure()) return; const r = await api.drillPromote(); onResult(r); setMsg(`Stored: from now on "${r.line.class}" expects board ${r.line.board}, ${r.line.steps} steps.`); }}>My line is right: store it</button>
          </div>
        </div>
      ) : g.line ? <p className="small up">You played the stored line step for step. No questions.</p>
        : <p className="small muted">No stored steps for this hand class yet, so only the numbers are compared.{g.class && g.verdict !== "below" ? " " : ""}{g.class && <button className="link" onClick={async () => { if (!sure()) return; const r = await api.drillPromote(); onResult(r); setMsg(`Stored your line for "${r.line.class}".`); }}>Store my line as the line for this class</button>}</p>}
      {msg && <p className="small up" role="status">{msg}</p>}

      <h3>Your results so far ({s.drills} drill{s.drills === 1 ? "" : "s"})</h3>
      <table className="stats-table">
        <thead><tr><th></th><th>Your rate</th><th>Exact odds for this deck</th></tr></thead>
        <tbody>
          <tr><td>Full board</td><td><b>{pct(s.fullBoard.yours)}</b></td><td>{pct(s.fullBoard.odds)}</td></tr>
          <tr><td>Nibiru-proof full board</td><td><b>{pct(s.nibiruProof.yours)}</b></td><td>{pct(s.nibiruProof.odds)}</td></tr>
          <tr><td>No board at all</td><td><b>{pct(s.brick.yours)}</b></td><td>{pct(s.brick.odds)} <span className="muted">(brick)</span></td></tr>
        </tbody>
      </table>
      <p className="small muted">Better {s.verdicts.better} · matched {s.verdicts.matched} · below {s.verdicts.below} · expected bricks {s.verdicts["expected brick"]}.{s.modelMissed.length ? ` You built a board from ${s.modelMissed.length} hand(s) the odds model calls a brick: report them with "That's wrong".` : ""}</p>
      <div className="row"><button onClick={onNext}>Next hand</button><button className="ghost" onClick={onClose}>Look at the board</button></div>
    </div>
  );
}

const ROLES = ["Starter", "Extender", "Combo piece", "Hand Trap", "Board Breaker", "Brick"];
/** Role chips under the card text. Saved in the pack's knowledge base (roles.json). */
export function RoleChips({ name, roles, onChange }: { name: string; roles: string[]; onChange: (roles: string[]) => void }) {
  return (
    <div className="chips role-chips" aria-label={`Roles of ${name}`}>
      {ROLES.map((r) => <button key={r} className={`chip${roles.includes(r) ? " on" : ""}`} onClick={() => onChange(roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r])}>{r}</button>)}
    </div>
  );
}

/** "That's wrong": a report with the exact position, kept as a regression case. */
export function Wrong({ card, onClose }: { card: string | null; onClose: () => void }) {
  const [kind, setKind] = useState("ruling"); const [text, setText] = useState(""); const [done, setDone] = useState("");
  return (
    <div className="window wrong" role="dialog" aria-label="That's wrong">
      <h3>That's wrong <button className="x" aria-label="Close" onClick={onClose}>×</button></h3>
      <p className="small muted">Saved with this exact position (it can be loaded again) in the knowledge base, as a case to fix and to test against.</p>
      <div className="row">
        <select aria-label="What is wrong" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="ruling">A ruling: the engine allowed or refused something</option><option value="line">A line or a grade</option><option value="role">A card's role</option><option value="other">Something else</option>
        </select>
        {card && <span className="small muted">Card in view: {card}</span>}
      </div>
      <textarea rows={3} aria-label="What is wrong, in your words" placeholder="What is wrong, in your words" value={text} onChange={(e) => setText(e.target.value)} />
      {done ? <p className="small up" role="status">{done}</p> : null}
      <div className="row"><button disabled={!text.trim()} onClick={async () => { try { const r = await api.wrong(kind, text.trim(), card); setDone(`Saved as case ${r.saved}.`); setText(""); } catch (e) { setDone((e as Error).message); } }}>Save report</button><button className="ghost" onClick={onClose}>Close</button></div>
    </div>
  );
}
