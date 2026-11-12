import { useEffect, useMemo, useRef, useState } from "react";
import { Card, isMonster, loadCardDb } from "./lib/cards/db";
import { importDeck } from "./lib/cards/resolve";
import { evaluate, GoalResult, Requirement } from "./lib/combo/engine";
import { DeckEntry, describe, Filter } from "./lib/combo/filters";
import { Change, suggestChanges, trimTo, Weighted } from "./lib/combo/optimise";
import { autoSetup, buildEffects, buildGoals, CardSetup, EXCAVATORS, GALAXY_PRESET, hasRole, PresetSetup, resolvePreset, rolesOf, SetupMap, upgradeSetup } from "./lib/combo/setup";
import { countCards, Deck } from "./lib/deck/types";
import { toYdke } from "./lib/deck/ydke";
import { GALAXY_EXAMPLE } from "./lib/examples";
import { Role, ROLE_COLOURS, ROLE_HELP, ROLES } from "./lib/roles";
import { Zone } from "./lib/combo/engine";
import { normaliseName } from "./lib/cards/db";
import { generalisations, ReplayPanel } from "./components/ReplayPanel";
import { SynergyGraph } from "./components/SynergyGraph";
import { Route } from "./lib/combo/setup";
import { ExactStats, packApplies } from "./components/ExactStats";
import pack from "../../packs/galaxy-eyes/deck.json";

/** The pack list as a text recipe the importer already understands. */
const PACK_LIST = ["Main", ...Object.entries(pack.main).map(([n, k]) => `${k} ${n}`), "Extra", ...pack.extra.map((n) => `1 ${n}`)].join(String.fromCharCode(10));

const db = loadCardDb();
const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const nameOf = (id: number) => db.byId.get(id)?.name ?? `#${id}`;
const KIND_COLOURS: Record<Card["kind"], string> = { monster: "#c8873a", spell: "#1d9e8a", trap: "#b0306a", extra: "#6a4bc4" };
const LIMIT_LABEL = ["Forbidden", "Limited", "Semi-Limited"];
const SAVE_KEY = "ygo-ratio-v3";
const capOf = (id: number) => db.byId.get(id)?.limit ?? 3;

interface Saved { deck: Deck; counts: Record<number, number>; setup: SetupMap; maxBricks: number; weight1: number }
function loadSaved(): Saved | null {
  try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}

/** Options for "needs" and "searches" pickers, built from what's actually in the deck. */
function filterOptions(ids: number[]): { group: string; items: { value: Filter; label: string }[] }[] {
  const cards = ids.map((id) => db.byId.get(id)!).filter(Boolean);
  const mons = cards.filter(isMonster);
  const uniq = <T,>(xs: T[]) => [...new Set(xs)];
  const attrs = uniq(mons.map((c) => c.attribute).filter(Boolean)) as string[];
  const levels = uniq(mons.map((c) => c.level).filter(Boolean) as number[]).sort((a, b) => a - b);
  const attrLevels = uniq(mons.filter((c) => c.attribute && c.level).map((c) => `attr:${c.attribute}+level:${c.level}`));
  const races = uniq(mons.map((c) => c.race).filter(Boolean)) as string[];
  const wordCount = new Map<string, number>();
  for (const c of cards) for (const w of uniq(c.name.split(/[\s\-:,]+/).filter((w) => w.length >= 4 && /^[A-Z]/.test(w)))) wordCount.set(w, (wordCount.get(w) ?? 0) + 1);
  const words = [...wordCount].filter(([, n]) => n >= 3).map(([w]) => w);
  const opt = (value: Filter) => ({ value, label: describe(value, nameOf) });
  return [
    { group: "General", items: ["any", "kind:monster", "kind:spell", "kind:trap", "tuner"].map(opt) },
    { group: "Your roles", items: ["role:Starter", "role:Extender", "role:Combo piece", "role:Hand Trap", "role:Board Breaker"].map(opt) },
    { group: "Attribute", items: attrs.map((a) => opt(`attr:${a}`)) },
    { group: "Attribute + Level", items: attrLevels.map(opt) },
    { group: "Level", items: levels.map((l) => opt(`level:${l}`)) },
    { group: "Type", items: races.map((r) => opt(`race:${r}`)) },
    { group: "Name contains", items: words.flatMap((w) => [opt(`name:${w}+kind:monster`), opt(`name:${w}`)]) },
    { group: "Specific card", items: uniq(ids).map((id) => opt(`card:${id}`)) },
  ].filter((g) => g.items.length);
}

function FilterSelect({ value, onChange, options }: { value: Filter; onChange: (f: Filter) => void; options: ReturnType<typeof filterOptions> }) {
  const known = options.some((g) => g.items.some((o) => o.value === value));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {!known && <option value={value}>{describe(value, nameOf)}</option>}
      {options.map((g) => (
        <optgroup key={g.group} label={g.group}>
          {g.items.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

export default function App() {
  const saved = useMemo(loadSaved, []);
  const [input, setInput] = useState("");
  const [deck, setDeck] = useState<Deck | null>(saved?.deck ?? null);
  const [counts, setCounts] = useState<Record<number, number>>(saved?.counts ?? {});
  const [setup, setSetup] = useState<SetupMap>(() => Object.fromEntries(Object.entries(saved?.setup ?? {}).map(([k, v]) => [k, upgradeSetup(v)])));
  const [maxBricks, setMaxBricks] = useState(saved?.maxBricks ?? 2);
  const [weight1, setWeight1] = useState(saved?.weight1 ?? 50);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [showSide, setShowSide] = useState(false);

  useEffect(() => {
    if (!deck) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ deck, counts, setup, maxBricks, weight1 })); } catch { /* storage unavailable */ }
  }, [deck, counts, setup, maxBricks, weight1]);

  function doImport(text: string, fileName?: string, preset?: Record<string, PresetSetup>) {
    setError("");
    try {
      const r = importDeck(text, db, fileName);
      setDeck(r.deck);
      setWarnings(r.warnings);
      setCounts(Object.fromEntries(countCards(r.deck.main)));
      const s: SetupMap = {};
      for (const id of [...r.deck.main, ...r.deck.side]) {
        const c = db.byId.get(id);
        const idOfName = (n: string) => [...r.deck.main, ...r.deck.side].find((x) => db.byId.get(x)?.name === n);
        if (c) s[id] = preset?.[c.name] ? resolvePreset(preset[c.name], idOfName) : autoSetup(c);
      }
      setSetup(s);
      setResult(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // ---------- derived model ----------
  const sideCounts = useMemo(() => Object.fromEntries(countCards(deck?.side ?? [])), [deck]);
  const entry = (id: number, copies: number): DeckEntry =>
    ({ id, card: db.byId.get(id)!, copies, roles: rolesOf(setup[id]) });
  // Stable display order (monsters, spells, traps, then name) so tiles don't jump when you re-tag them.
  const KIND_ORDER = { monster: 0, spell: 1, trap: 2, extra: 3 };
  const sortEntries = (xs: DeckEntry[]) => xs.sort((a, b) =>
    KIND_ORDER[a.card.kind] - KIND_ORDER[b.card.kind] || a.card.name.localeCompare(b.card.name));
  const main: DeckEntry[] = useMemo(() => sortEntries(Object.entries(counts).map(([id, n]) => entry(Number(id), n)).filter((e) => e.card)), [counts, setup]); // eslint-disable-line react-hooks/exhaustive-deps
  const side: DeckEntry[] = useMemo(() => sortEntries(Object.entries(sideCounts).map(([id, n]) => entry(Number(id), n)).filter((e) => e.card)), [sideCounts, setup]); // eslint-disable-line react-hooks/exhaustive-deps
  const deckSize = main.reduce((s, e) => s + e.copies, 0);
  // by card name, for the exact (pack) model
  const nameCounts = useMemo(() => Object.fromEntries(main.filter((e) => e.copies > 0).map((e) => [e.card.name, e.copies])), [main]);
  const importedCounts = useMemo(() => (deck ? Object.fromEntries([...countCards(deck.main)].map(([id, n]) => [nameOf(id), n])) : null), [deck]);
  const goals = useMemo(() => buildGoals(main, setup, nameOf, { maxBricks }), [main, setup, maxBricks]);
  const fx = useMemo(() => buildEffects([...main, ...side], setup), [main, side, setup]);
  const weighted: Weighted[] = useMemo(() => [
    { goal: goals.first, weight: weight1 / 100 }, { goal: goals.second, weight: 1 - weight1 / 100 },
  ], [goals, weight1]);
  const options = useMemo(() => filterOptions([...main, ...side].map((e) => e.id)), [main, side]);
  const starters = main.filter((e) => hasRole(setup[e.id], "Starter"));
  const fetchers = starters.filter((e) => setup[e.id]?.search);       // count through what they fetch
  const lineStarters = starters.filter((e) => !setup[e.id]?.search);  // have a line of their own
  const needsNumber = main.some((e) => e.copies > 0 && e.card.name === "Seventh Tachyon") && !(deck?.extra ?? []).some((id) => /^Number 10[1-7]:/.test(db.byId.get(id)?.name ?? ""));

  // ---------- live odds (debounced so − / + stays snappy) ----------
  const [odds, setOdds] = useState<GoalResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!deck || deckSize < 6) { setOdds(null); return; }
    setBusy(true);
    const t = setTimeout(() => { setOdds(evaluate(main, [goals.first, goals.second], fx, { perLine: true })); setBusy(false); }, 60);
    return () => clearTimeout(t);
  }, [main, goals, fx, deck, deckSize]);

  // ---------- optimiser (runs in small chunks so the page never freezes) ----------
  const [result, setResult] = useState<{ base: Change; changes: Change[]; trim?: { cuts: number[]; steps: { pick: number; tied: number[] }[]; probs: number[] } } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const runId = useRef(0);
  useEffect(() => { runId.current++; setProgress(null); setResult(null); }, [main, setup, maxBricks, weight1]);

  function runOptimiser() {
    const id = ++runId.current;
    const keep = (cid: number) => !!setup[cid]?.keep;
    const gen1 = suggestChanges(main, side, weighted, fx, { maxCopies: (cid) => Math.min(capOf(cid), setup[cid]?.max ?? 3), keep });
    const gen2 = deckSize > 40 ? trimTo(main, weighted, fx, 40, keep) : null;
    let first: { base: Change; changes: Change[] } | null = null;
    setProgress(0);
    const step = () => {
      if (id !== runId.current) return;
      const t0 = performance.now();
      while (performance.now() - t0 < 30) {
        if (!first) {
          const r = gen1.next();
          if (r.done) { first = r.value; if (!gen2) { setResult(first); setProgress(null); return; } }
          else setProgress((r.value.progress * (gen2 ? 0.5 : 1)));
        } else {
          const r = gen2!.next();
          if (r.done) { setResult({ ...first, trim: r.value }); setProgress(null); return; }
          setProgress(0.5 + r.value.progress * 0.5);
        }
      }
      setTimeout(step, 0);
    };
    step();
  }

  function applyChange(out?: number, inn?: number) {
    const c = { ...counts };
    if (out !== undefined) c[out] = Math.max(0, (c[out] ?? 0) - 1);
    if (inn !== undefined) c[inn] = (c[inn] ?? 0) + 1;
    setCounts(c);
  }

  // ---------- banlist ----------
  const banIssues = useMemo(() => Object.entries(counts).flatMap(([id, n]) => {
    const c = db.byId.get(Number(id));
    if (!c || c.limit === undefined || n <= c.limit) return [];
    return [`${c.name}: ${n} copies, but it's ${LIMIT_LABEL[c.limit]} (max ${c.limit})`];
  }), [counts]);

  const currentDeck = (): Deck => ({ ...deck!, main: Object.entries(counts).flatMap(([id, n]) => Array(n).fill(Number(id))) });
  async function copyYdke() {
    try { await navigator.clipboard.writeText(toYdke(currentDeck())); setCopied("Copied!"); }
    catch { setCopied("Copy blocked — the link is in the box above"); setInput(toYdke(currentDeck())); }
    setTimeout(() => setCopied(""), 2500);
  }

  const setCard = (id: number, patch: Partial<CardSetup>) => setSetup({ ...setup, [id]: { ...(setup[id] ?? { roles: [] }), ...patch } });

  return (
    <div className="app">
      <header>
        <h1>YGO Ratio Optimiser</h1>
        <span className="muted">{db.banlist} banlist · {db.byName.size.toLocaleString()} cards built in</span>
      </header>

      {/* 1. Import */}
      <section className="panel">
        <h2>1 · Import your deck</h2>
        <p className="muted">Paste a <b>ydke://</b> link, a <b>YGO Omega code</b>, a <b>.ydk</b>, or a text list (“3 Ash Blossom”, with Monster / Spell / Trap / Extra / Side headers if you like). Or drop a .ydk file.</p>
        <textarea value={input} rows={5} placeholder="Paste here…" onChange={(e) => setInput(e.target.value)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { const t = await f.text(); setInput(t); doImport(t, f.name); } }} />
        <div className="row">
          <button onClick={() => doImport(input)} disabled={!input.trim()}>Import</button>
          <label className="file">or choose .ydk
            <input type="file" accept=".ydk,.txt" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const t = await f.text(); setInput(t); doImport(t, f.name); } }} />
          </label>
          <button className="ghost" onClick={() => { setInput(PACK_LIST); doImport(PACK_LIST, undefined, GALAXY_PRESET); }}>Load my current list</button>
          <button className="ghost" onClick={() => { setInput(GALAXY_EXAMPLE); doImport(GALAXY_EXAMPLE, undefined, GALAXY_PRESET); }}>Load Galaxy example</button>
          {deck && <button className="ghost" onClick={copyYdke}>Copy tweaked deck as ydke://</button>}
          {copied && <span className="muted">{copied}</span>}
        </div>
        {error && <p className="error">{error}</p>}
        {warnings.map((w) => <p key={w} className="warn">⚠ {w}</p>)}
        {banIssues.map((w) => <p key={w} className="error">⛔ {w}</p>)}
        {needsNumber && <p className="warn">⚠ Seventh Tachyon needs a “Number 101–107” Xyz Monster (e.g. Number 107) in your Extra Deck to reveal — without one it does nothing.</p>}
        {banIssues.length > 0 && (
          <button className="ghost" onClick={() => setCounts(Object.fromEntries(Object.entries(counts).map(([id, n]) => [id, Math.min(n, capOf(Number(id)))])))}>Trim to {db.banlist} banlist</button>
        )}
      </section>

      {deck && (
        <>
          {packApplies(nameCounts) && <ExactStats deck={nameCounts} baseline={importedCounts} maxCopies={(n) => db.byName.get(normaliseName(n))?.limit ?? 3} />}

          {/* 2. Tag */}
          <section className="panel">
            <h2>2 · Tell it what each card does <span className="muted">· Main Deck {deckSize}</span></h2>
            <p className="muted">
              Each tile says <b>why that card is in the deck</b> — change anything that's wrong. A card can have <b>several roles</b>.
              <b>Starters</b> can need other cards (Galaxy Soldier needs another LIGHT monster in hand); a Starter that <b>fetches</b> (Wizard, Seventh Tachyon) counts through what it fetches.
              <b>Combo pieces</b> are what the combo uses — if one is cut to 0, the lines that use it are impossible. Tick <b>Dead if drawn</b> for bricks. Pot of Prosperity is handled automatically.
            </p>
            <div className="cards">
              {main.map((e) => (
                <CardTile key={e.id} e={e} s={setup[e.id] ?? { roles: [] }} options={options} starters={lineStarters} entryOf={(cid) => [...main, ...side].find((x) => x.id === cid)}
                  onCopies={(n) => setCounts({ ...counts, [e.id]: n })} onSetup={(p) => setCard(e.id, p)} />
              ))}
            </div>
            {side.length > 0 && (
              <>
                <button className="link" onClick={() => setShowSide(!showSide)}>{showSide ? "▾" : "▸"} Side Deck ({side.reduce((s, e) => s + e.copies, 0)}) — tag these too so suggestions can bring them in</button>
                {showSide && (
                  <div className="cards">
                    {side.map((e) => <CardTile key={e.id} e={e} s={setup[e.id] ?? { roles: [] }} options={options} starters={lineStarters} entryOf={(cid) => [...main, ...side].find((x) => x.id === cid)} onSetup={(p) => setCard(e.id, p)} />)}
                  </div>
                )}
              </>
            )}
          </section>

          <ReplayPanel main={main} side={side} extraIds={deck.extra} nameOf={nameOf} needsOf={(sid) => setup[sid]?.needs ?? []}
            onApply={(id: number, route: Route) => {
              const cur = setup[id] ?? { roles: [] };
              const roles = cur.roles.includes("Starter") ? cur.roles : [...cur.roles, "Starter" as Role];
              setSetup({ ...setup, [id]: { ...cur, roles, routes: [...(cur.routes ?? []).filter((r) => r.name !== route.name), route] } });
            }} />

          {/* 3. Odds */}
          <section className="panel">
            <h2>3 · Your odds {busy && <span className="muted small">updating…</span>}</h2>
            {starters.length === 0 ? <p className="warn">Tag at least one card as a Starter to see your odds.</p> : odds && (
              <>
                <div className="stats">
                  <div className="stat">
                    <div className="muted">Going 1st · 5 cards</div>
                    <div className="big">{pct(odds[0].p)}</div>
                    <div className="goal-name">A starter line is live, with at most {maxBricks} dead card{maxBricks === 1 ? "" : "s"}</div>
                    <p className="muted small">Includes searching into a starter and Pot of Prosperity.</p>
                  </div>
                  <div className="stat">
                    <div className="muted">Going 2nd · 6 cards</div>
                    <div className="big">{pct(odds[1].p)}</div>
                    <div className="goal-name">A starter line + 1 hand trap / board breaker, or 2 of them</div>
                    <p className="muted small">Same, plus a hand trap / board breaker in hand.</p>
                  </div>
                </div>
                <p className="muted small">
                  Hands with more than <input className="num" type="number" min={0} max={6} value={maxBricks} onChange={(e) => setMaxBricks(Math.max(0, Math.min(6, Number(e.target.value) || 0)))} /> dead cards
                  (cards marked “Dead if drawn”) count as failures.
                </p>
                <h3>Over a match (Bo3)</h3>
                <div className="bo3">
                  {[["going 1st", odds[0].p], ["going 2nd", odds[1].p]].map(([label, p]) => (
                    <div key={label as string}>
                      <div className="muted small">At least one bad hand {label}…</div>
                      <div><b>{pct(1 - (p as number) ** 2)}</b> <span className="muted small">over 2 games</span> · <b>{pct(1 - (p as number) ** 3)}</b> <span className="muted small">over 3 games</span></div>
                    </div>
                  ))}
                </div>
                <p className="muted small">Each game is a fresh shuffle, so this is 1 − (chance of a good hand)<sup>games</sup>. A 2-game match is a 2–0; most matches see you go first and second at least once each.</p>
                <h3>How often each starter line is live (going 1st)</h3>
                <div className="bars">
                  {goals.first.lines.map((l, i) => (
                    <div key={l.name} className="line-row">
                      <div className="bar-row">
                        <span>{l.name}</span>
                        <div className="bar"><div style={{ width: pct(odds[0].perLine[i]), background: ROLE_COLOURS.Starter }} /></div>
                        <b>{pct(odds[0].perLine[i])}</b>
                      </div>
                      <div className="muted small line-needs">needs {l.reqs.slice(1).map((r) => describeReq(r)).join(" · ") || "nothing else"}</div>
                    </div>
                  ))}
                </div>
                {fetchers.length > 0 && <p className="muted small">{fetchers.map((f) => f.card.name).join(" and ")} count through what they fetch, so they have no line of their own.</p>}
                <p className="muted small">Lines overlap, so they add up to more than the total — the total counts each hand once.</p>
                <h3>What each line needs</h3>
                <SynergyGraph lines={goals.first.lines} perLine={odds[0].perLine} nameOf={nameOf} copiesOf={(cid) => counts[cid] ?? 0} />
              </>
            )}
          </section>

          {/* 4. Suggestions */}
          {starters.length > 0 && (
            <section className="panel">
              <h2>4 · Suggested changes</h2>
              <div className="row">
                <span className="muted">Going 1st</span>
                <input type="range" min={0} max={100} value={100 - weight1} onChange={(e) => setWeight1(100 - Number(e.target.value))} />
                <span className="muted">Going 2nd</span>
                <span className="small muted">({weight1}% / {100 - weight1}%)</span>
              </div>
              <div className="row">
                <button onClick={runOptimiser} disabled={progress !== null}>{progress !== null ? `Checking… ${Math.round(progress * 100)}%` : "Find better ratios"}</button>
                <span className="muted small">Tries every −1 / +1 (Side Deck included) and every swap, plus the best cuts down to 40.</span>
              </div>
              {result && <Suggestions result={result} weight1={weight1} onApply={applyChange} onApplyTrim={(cuts) => {
                const c = { ...counts }; for (const id of cuts) c[id]--; setCounts(c);
              }} />}
            </section>
          )}

          <section className="panel notes">
            <h3>What the maths assumes</h3>
            <ul className="muted small">
              <li>Odds are exact (every possible hand is counted), not simulated.</li>
              <li>Each requirement in a line uses a different card. A fetcher (Wizard, Seventh Tachyon) is used up and adds the best card it can; Soldier-style costs and Seventh Tachyon's “put a card back” are tried every way.</li>
              <li>Combo pieces “must stay in Deck” fail the line if drawn (Photon Emperor); the rest only fail if you cut them all. Cards marked <b>Never cut</b> are left alone.</li>
              <li>Pot of Prosperity / Duality: excavate 6 / 3 from what's left in the Deck and add 1; fetchers already in hand can still act after.</li>
              <li>Extenders don't affect the odds yet. Not modelled: Normal Summon clashes between starters, Dominus Spark/Purge locking your own monsters, and the opponent's interaction.</li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

const ZONE_LABEL: Record<Zone, string> = { hand: "in hand", deck: "in the Deck", any: "anywhere in the 40" };
const describeReq = (r: Requirement) =>
  `${r.min > 1 ? `${r.min}× ` : ""}${describe(r.match, nameOf)}${r.from === "deck" ? " (must stay in Deck)" : r.from === "hand" ? " (in hand)" : ""}`;

function ZoneSelect({ value, onChange }: { value: Zone; onChange: (z: Zone) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Zone)}>
      {(Object.keys(ZONE_LABEL) as Zone[]).map((z) => <option key={z} value={z}>{ZONE_LABEL[z]}</option>)}
    </select>
  );
}

function CardTile({ e, s, options, starters, onCopies, onSetup, entryOf }: {
  e: DeckEntry; s: CardSetup; options: ReturnType<typeof filterOptions>; starters: DeckEntry[]; entryOf: (id: number) => DeckEntry | undefined;
  onCopies?: (n: number) => void; onSetup: (p: Partial<CardSetup>) => void;
}) {
  const c = e.card;
  const max = c.limit ?? 3;
  const meta = [c.attribute, c.level ? `Lv ${c.level}` : "", c.race, !isMonster(c) ? c.kind : ""].filter(Boolean).join(" · ");
  const auto = EXCAVATORS[normaliseName(c.name)];
  const isStarter = hasRole(s, "Starter"), isPiece = hasRole(s, "Combo piece");
  const toggleRole = (r: Role) => onSetup({ roles: s.roles.includes(r) ? s.roles.filter((x) => x !== r) : [...s.roles, r] });
  const setNeed = (i: number, r: Requirement | null) => {
    const needs = [...(s.needs ?? [])];
    if (r) needs[i] = r; else needs.splice(i, 1);
    onSetup({ needs });
  };
  const usedBy = s.usedBy ?? "all";
  const toggleUser = (id: number) => {
    const cur = usedBy === "all" ? starters.map((x) => x.id) : usedBy;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    onSetup({ usedBy: next.length === starters.length ? "all" : next });
  };
  return (
    <div className={`card ${e.copies === 0 ? "cut" : ""}`}>
      <div className="kind" style={{ background: KIND_COLOURS[c.kind] }} />
      <div className="card-body">
        <div className="card-name" title={c.name}>{c.name}</div>
        <div className="card-meta">{meta}</div>
        <div className="stepper">
          {onCopies ? <>
            <button aria-label="fewer" onClick={() => onCopies(Math.max(0, e.copies - 1))}>−</button>
            <b>{e.copies}</b>
            <button aria-label="more" disabled={e.copies >= max} onClick={() => onCopies(Math.min(max, e.copies + 1))}>+</button>
          </> : <b className="muted">{e.copies}× in Side</b>}
          {c.limit !== undefined && <span className={`limit l${c.limit}`}>{LIMIT_LABEL[c.limit]}</span>}
        </div>
        {s.note && <div className="why">{s.note}</div>}
        <div className="chips">
          {ROLES.map((r) => (
            <button key={r} title={ROLE_HELP[r]} className={`chip ${s.roles.includes(r) ? "on" : ""}`}
              style={s.roles.includes(r) ? { background: ROLE_COLOURS[r], borderColor: ROLE_COLOURS[r] } : {}}
              onClick={() => toggleRole(r)}>{r}</button>
          ))}
        </div>
        <div className="flags">
          <label className={s.brick ? "on-brick" : ""}><input type="checkbox" checked={!!s.brick} onChange={(ev) => onSetup({ brick: ev.target.checked })} /> Dead if drawn</label>
          <label className={s.keep ? "on-keep" : ""}><input type="checkbox" checked={!!s.keep} onChange={(ev) => onSetup({ keep: ev.target.checked })} /> Never cut</label>
          <label title="The optimiser won't suggest adding copies beyond this">add up to <select value={s.max ?? 3} onChange={(ev) => onSetup({ max: Number(ev.target.value) })}>{[1, 2, 3].map((k) => <option key={k}>{k}</option>)}</select></label>
        </div>

        {isStarter && s.routes && s.routes.length > 0 && (
          <div className="extra">
            <span className="muted small">Routes from replays (live if any is):</span>
            {s.routes.map((r, ri) => (
              <div key={r.name}>
                <div className="need">
                  <span className="pill z-any">▶ {r.name}</span>
                  <button className="x" title="Remove this route" onClick={() => onSetup({ routes: s.routes!.filter((x) => x !== r) })}>×</button>
                </div>
                {r.reqs.map((q, qi) => (q.from ?? "hand") !== "hand" ? null : (
                  <div key={qi} className="need route-hand">
                    <span className="muted">+ in hand:</span>
                    <select value={q.match} onChange={(ev) => {
                      const cur = r.reqs[qi].match;
                      const orig = { ...(r.orig ?? {}), ...(cur.startsWith("card:") && r.orig?.[qi] === undefined ? { [qi]: Number(cur.slice(5)) } : {}) };
                      const routes = s.routes!.map((x, xi) => xi !== ri ? x : { ...x, orig, reqs: x.reqs.map((y, yi) => (yi === qi ? { ...y, match: ev.target.value } : y)) });
                      onSetup({ routes });
                    }}>
                      {(() => {
                        // offer generalisations of the card originally recorded (kept in `card` if it was exact)
                        const orig = r.reqs[qi].match.startsWith("card:") ? Number(r.reqs[qi].match.slice(5)) : r.orig?.[qi];
                        const opts = orig !== undefined ? generalisations(entryOf(orig), orig, nameOf) : [];
                        if (!opts.some((o) => o.value === q.match)) opts.unshift({ value: q.match, label: `any ${describe(q.match, nameOf)}` });
                        return opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>);
                      })()}
                    </select>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        {isStarter && !s.search && !s.routes?.length && (
          <div className="extra">
            {(s.needs ?? []).map((n, i) => (
              <div key={i} className="need">
                <span className="muted">needs</span>
                <select value={n.min} onChange={(ev) => setNeed(i, { ...n, min: Number(ev.target.value) })}>
                  {[1, 2, 3].map((k) => <option key={k}>{k}</option>)}
                </select>
                <FilterSelect value={n.match} options={options} onChange={(f) => setNeed(i, { ...n, match: f })} />
                <ZoneSelect value={n.from ?? "hand"} onChange={(z) => setNeed(i, { ...n, from: z })} />
                <button className="x" onClick={() => setNeed(i, null)}>×</button>
              </div>
            ))}
            <button className="link" onClick={() => setNeed((s.needs ?? []).length, { match: "kind:monster", min: 1 })}>+ needs another card</button>
          </div>
        )}
        {isStarter && s.search && !s.routes?.length && <span className="muted small">Counts through what it fetches — no line of its own.</span>}

        {isPiece && (
          <div className="extra">
            <div className="need">
              <span className="muted">must be</span>
              <ZoneSelect value={s.zone ?? "deck"} onChange={(z) => onSetup({ zone: z })} />
              <span className="muted">for</span>
            </div>
            <div className="chips">
              {starters.length === 0 && <span className="muted small">tag your starters first</span>}
              {starters.map((st) => {
                const on = usedBy === "all" || usedBy.includes(st.id);
                return <button key={st.id} className={`chip ${on ? "on" : ""}`} style={on ? { background: ROLE_COLOURS.Starter, borderColor: ROLE_COLOURS.Starter } : {}}
                  onClick={() => toggleUser(st.id)}>{st.card.name}</button>;
              })}
            </div>
            <span className="muted small">{(s.zone ?? "deck") === "deck" ? "Drawing it or cutting it breaks these lines." : (s.zone === "any" ? "Only cutting every copy breaks these lines." : "Must be in your opening hand.")}</span>
          </div>
        )}

        <div className="extra">
          {auto ? <span className="muted small">⛏ excavates {auto}, adds 1 (automatic)</span> : s.search !== undefined ? (
            <>
              <div className="need">
                <span className="muted">fetches</span>
                <FilterSelect value={s.search} options={options} onChange={(f) => onSetup({ search: f })} />
                <button className="x" onClick={() => onSetup({ search: undefined, cost: undefined, putBack: undefined })}>×</button>
              </div>
              <label className="muted small"><input type="checkbox" checked={!!s.cost} onChange={(ev) => onSetup({ cost: ev.target.checked ? "attr:LIGHT" : undefined })} /> discards another card from hand first</label>
              {s.cost && <div className="need"><FilterSelect value={s.cost} options={options} onChange={(f) => onSetup({ cost: f })} /></div>}
              <label className="muted small"><input type="checkbox" checked={!!s.putBack} onChange={(ev) => onSetup({ putBack: ev.target.checked })} /> then puts a hand card on top of the Deck</label>
            </>
          ) : <button className="link" onClick={() => onSetup({ search: "kind:monster" })}>+ fetches from Deck</button>}
        </div>
      </div>
    </div>
  );
}

function Suggestions({ result, weight1, onApply, onApplyTrim }: {
  result: { base: Change; changes: Change[]; trim?: { cuts: number[]; steps: { pick: number; tied: number[] }[]; probs: number[] } };
  weight1: number; onApply: (out?: number, inn?: number) => void; onApplyTrim: (cuts: number[]) => void;
}) {
  const [pick, setPick] = useState<Record<string, { o?: number; i?: number }>>({});
  const { base, changes, trim } = result;
  const delta = (p: number, b: number) => {
    const d = (p - b) * 100;
    return <span className={d > 0.05 ? "up" : d < -0.05 ? "down" : "muted"}>{d >= 0 ? "+" : ""}{d.toFixed(1)}</span>;
  };
  // Group consecutive cuts that chose from the same set of equal options: "cut 4 from A, B, C".
  const trimGroups: { n: number; from: number[] }[] = [];
  for (const st of trim?.steps ?? []) {
    const key = [...st.tied].sort().join(",");
    const g = trimGroups[trimGroups.length - 1];
    if (g && [...g.from].sort().join(",") === key) g.n++; else trimGroups.push({ n: 1, from: st.tied });
  }
  return (
    <div className="suggest">
      <p className="muted small">Now: going 1st {pct(base.probs[0])}, going 2nd {pct(base.probs[1])} at {base.deckSize} cards (weighting {weight1}/{100 - weight1}).</p>
      {trim && trim.cuts.length > 0 && (
        <div className="sugg best40">
          <div>
            <b>Best cut to 40:</b>{" "}
            {trimGroups.map((g, i) => (
              <span key={i}>{i > 0 && "; "}cut {g.n} {g.from.length === 1 ? <b>{nameOf(g.from[0])}</b> : <>from <b>{g.from.map(nameOf).join(", ")}</b></>}</span>
            ))}
            {trimGroups.some((g) => g.from.length > 1) && <div className="muted small">Cards listed together are equal for your goals — cut whichever you'd miss least.</div>}
          </div>
          <div className="nums">1st {pct(trim.probs[0])} {delta(trim.probs[0], base.probs[0])} · 2nd {pct(trim.probs[1])} {delta(trim.probs[1], base.probs[1])}</div>
          <button className="ghost" onClick={() => onApplyTrim(trim.cuts)}>Apply</button>
        </div>
      )}
      {changes.length === 0 && <p className="muted">No single change improves your score — your ratios look tight for these goals.</p>}
      {changes.slice(0, 8).map((c, k) => {
        const key = String(k);
        const o = pick[key]?.o ?? c.outs[0], i = pick[key]?.i ?? c.ins[0];
        return (
          <div className="sugg" key={k}>
            <div>
              {c.outs.length > 0 && <>−1 {c.outs.length > 1
                ? <select value={o} onChange={(e) => setPick({ ...pick, [key]: { ...pick[key], o: Number(e.target.value) } })}>{c.outs.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}</select>
                : <b>{nameOf(c.outs[0])}</b>}</>}
              {c.outs.length > 0 && c.ins.length > 0 && <span className="muted"> → </span>}
              {c.ins.length > 0 && <>+1 {c.ins.length > 1
                ? <select value={i} onChange={(e) => setPick({ ...pick, [key]: { ...pick[key], i: Number(e.target.value) } })}>{c.ins.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}</select>
                : <b>{nameOf(c.ins[0])}</b>}</>}
              {(c.outs.length > 1 || c.ins.length > 1) && <div className="muted small">Options in a dropdown are equal for your goals.</div>}
            </div>
            <div className="nums">{c.deckSize} cards · 1st {pct(c.probs[0])} {delta(c.probs[0], base.probs[0])} · 2nd {pct(c.probs[1])} {delta(c.probs[1], base.probs[1])}</div>
            <button className="ghost" onClick={() => onApply(c.outs.length ? o : undefined, c.ins.length ? i : undefined)}>Apply</button>
          </div>
        );
      })}
    </div>
  );
}
