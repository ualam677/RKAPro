import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Answer, api, CardInfo, CardRef, FieldCard, LOC, LOC_LABEL, Prompt, SaveMeta, Side, TYPE, View } from "./api";
import { RACES } from "../lib/cards/db";
import { parseYdk } from "../lib/deck/ydk";
import "./duel.css";

export interface DuelDeck { name: string; main: number[]; extra: number[] }
const ATTR: Record<number, string> = { 1: "EARTH", 2: "WATER", 4: "FIRE", 8: "WIND", 16: "LIGHT", 32: "DARK", 64: "DIVINE" };
const key = (c: { c: number; loc: number; seq: number }) => `${c.c}:${c.loc}:${c.seq}`;
const LAST_KEY = "rkapro-duel-last";

function typeLine(i: CardInfo): string {
  const t = i.type;
  if (t & TYPE.MONSTER) {
    const sub = [t & TYPE.FUSION && "Fusion", t & TYPE.RITUAL && "Ritual", t & TYPE.SYNCHRO && "Synchro", t & TYPE.XYZ && "Xyz", t & TYPE.LINK && "Link", t & TYPE.PENDULUM && "Pendulum", t & TYPE.TUNER && "Tuner", t & TYPE.EFFECT ? "Effect" : t & TYPE.TOKEN ? "Token" : "Normal"].filter(Boolean);
    const race = i.race ? RACES[Math.log2(i.race & -i.race)] : "?";
    return `${ATTR[i.attribute ?? 0] ?? ""} · ${race} / ${sub.join(" / ")}`;
  }
  const kind = t & TYPE.SPELL ? "Spell" : "Trap";
  const sub = t & TYPE.QUICKPLAY ? "Quick-Play " : t & TYPE.CONTINUOUS ? "Continuous " : t & TYPE.EQUIP ? "Equip " : t & TYPE.FIELD ? "Field " : t & TYPE.COUNTER ? "Counter " : t & TYPE.RITUAL ? "Ritual " : "Normal ";
  return sub + kind;
}
const frame = (t: number) => (t & TYPE.SPELL ? "spell" : t & TYPE.TRAP ? "trap" : t & TYPE.XYZ ? "xyz" : t & TYPE.LINK ? "link" : t & TYPE.SYNCHRO ? "synchro" : t & TYPE.FUSION ? "fusion" : t & TYPE.RITUAL ? "ritual" : t & TYPE.EFFECT ? "effect" : "normal");

/** A card picture: EDOPro's picture if the server has it, otherwise a drawn card (name on a frame-coloured tile). */
function Pic({ code, info, faceDown }: { code: number; info?: CardInfo; faceDown?: boolean }) {
  const [broken, setBroken] = useState(false);
  if (faceDown || !code) return <div className="pic back"><img src="/api/texture/cover.png" alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} /></div>;
  if (broken) return <div className={`pic drawn f-${frame(info?.type ?? 0)}`}><span>{info?.name ?? code}</span>{info && info.type & TYPE.MONSTER ? <em>{info.atk}/{info.def}</em> : null}</div>;
  return <div className="pic"><img src={`/api/pic/${code}`} alt={info?.name ?? String(code)} onError={() => setBroken(true)} /></div>;
}

export function Duel({ labDeck, packDeck }: { labDeck: DuelDeck | null; packDeck: DuelDeck }) {
  const [view, setView] = useState<View | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState<Record<number, CardInfo>>({});
  const [detail, setDetail] = useState<{ code: number; card?: FieldCard } | null>(null);
  const [menu, setMenu] = useState<{ actions: CardRef[]; x: number; y: number } | null>(null);
  const [pile, setPile] = useState<{ c: number; loc: number } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [saves, setSaves] = useState<{ saves: SaveMeta[]; current: string | null }>({ saves: [], current: null });
  const [showSaves, setShowSaves] = useState(false);
  const [setup, setSetup] = useState(false);
  const [note, setNote] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  const run = useCallback(async (f: () => Promise<View>) => {
    setMenu(null); setPicked([]); setError("");
    try { setView(await f()); setOffline(false); }
    catch (e) { const st = (e as { state?: View }).state; if (st) setView(st); setError((e as Error).message); }
  }, []);
  const refreshSaves = () => api.saves().then(setSaves).catch(() => {});
  useEffect(() => { api.state().then((v) => { setView(v.none ? null : v); if (v.none) setSetup(true); }).catch(() => setOffline(true)); refreshSaves(); }, []);
  const act = (a: Answer) => run(() => api.act(a));

  // card texts for everything on screen
  useEffect(() => {
    if (!view) return;
    const ids = new Set<number>();
    const add = (c?: { code: number; mats?: number[] } | null) => { if (c?.code) ids.add(c.code); c?.mats?.forEach((m) => ids.add(m)); };
    for (const s of view.sides) { [...s.hand, ...s.mzone, ...s.szone, ...s.grave, ...s.banished, ...s.extra].forEach(add); }
    [...(view.prompt?.actions ?? []), ...(view.prompt?.cards ?? []), ...view.chain].forEach(add); if (view.prompt?.code) ids.add(view.prompt.code);
    const need = [...ids].filter((id) => !info[id]);
    if (need.length) api.cards(need).then((r) => setInfo((old) => ({ ...old, ...Object.fromEntries(r.cards.map((c) => [c.id, c])) }))).catch(() => {});
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [view?.log.length, view?.notes.length]);

  const p = view?.prompt ?? null;
  const actionsBy = useMemo(() => { const m = new Map<string, CardRef[]>(); for (const a of p?.kind === "idle" ? p.actions ?? [] : []) m.set(key(a), [...(m.get(key(a)) ?? []), a]); return m; }, [p]);
  const selectBy = useMemo(() => new Map((p?.kind === "cards" || p?.kind === "chain" ? p.cards ?? [] : []).map((c) => [key(c), c])), [p]);
  const zoneBy = useMemo(() => new Map((p?.kind === "place" ? p.zones ?? [] : []).map((z) => [key(z), z.id])), [p]);
  const name = (code: number) => info[code]?.name ?? `#${code}`;

  // ---------- answering ----------
  function choose(c: CardRef) { // a card offered by a "cards" or "chain" prompt
    if (!p) return;
    if (p.kind === "chain" || p.oneByOne || (p.min === 1 && p.max === 1)) { act(p.kind === "chain" || p.oneByOne ? { id: c.id } : { ids: [c.id] }); return; }
    setPicked((x) => (x.includes(c.id) ? x.filter((i) => i !== c.id) : x.length < (p.max ?? 1) ? [...x, c.id] : x));
  }
  const canConfirm = p?.kind === "cards" && !p.oneByOne && picked.length >= (p.min ?? 1) && picked.length <= (p.max ?? 1);
  function clickCard(c: FieldCard, e: React.MouseEvent) {
    const k = key(c);
    if (actionsBy.has(k)) { setMenu({ actions: actionsBy.get(k)!, x: e.clientX, y: e.clientY }); return; }
    if (selectBy.has(k)) { choose(selectBy.get(k)!); return; }
    setDetail({ code: c.code, card: c });
  }
  function clickZone(c: number, loc: number, seq: number) {
    const id = zoneBy.get(`${c}:${loc}:${seq}`); if (!id || !p) return;
    if ((p.count ?? 1) <= 1) act({ ids: [id] });
    else { const next = [...picked, id]; if (next.length >= p.count!) act({ ids: next }); else setPicked(next); }
  }
  const cancel = () => {
    if (menu) return setMenu(null); if (pile) return setPile(null); if (setup && view) return setSetup(false); if (showSaves) return setShowSaves(false);
    if (!p) return;
    if (p.kind === "yesno") act({ yes: false }); else if (p.kind === "chain" && !p.forced) act({ cancel: true }); else if (p.kind === "cards" && p.cancel) act({ cancel: true }); else if (p.kind === "cards" && p.finish) act({ finish: true });
  };
  const confirm = () => { if (!p) return; if (p.kind === "yesno") act({ yes: true }); else if (canConfirm) act({ ids: picked }); else if (p.kind === "cards" && p.finish) act({ finish: true }); };

  // ---------- duel control ----------
  const last = (): { deck: DuelDeck; hand: number[] } | null => { try { return JSON.parse(localStorage.getItem(LAST_KEY) ?? "null"); } catch { return null; } };
  function start(deck: DuelDeck, hand: number[]) {
    try { localStorage.setItem(LAST_KEY, JSON.stringify({ deck, hand })); } catch { /* storage unavailable */ }
    setSetup(false); setDetail(null);
    run(() => api.newDuel({ main: deck.main, extra: deck.extra, hand })).then(refreshSaves);
  }
  const newHand = () => { const l = last(); if (l) start(l.deck, l.hand); else setSetup(true); };
  const quickSave = async () => { try { setSaves(await api.save()); setError(""); } catch (e) { setError((e as Error).message); } };
  const quickLoad = () => { const s = saves.saves[saves.saves.length - 1]; if (s) run(() => api.load(s.id)).then(refreshSaves); };

  // EDOPro-style keys. Esc / right-click: cancel or "no". Enter / Space: confirm or "yes".
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      const k = e.key.toLowerCase();
      if (k === "escape") cancel();
      else if (k === "enter" || k === " ") { e.preventDefault(); confirm(); }
      else if ((k === "z" && (e.ctrlKey || e.metaKey)) || k === "u") { if (view?.canUndo) run(() => api.undo()); }
      else if (k === "s" && !e.ctrlKey) quickSave();
      else if (k === "l") quickLoad();
      else if (k === "n") newHand();
      else if (k === "b" || k === "e") { const ph = p?.phases?.find((x) => (k === "b" ? /Battle/.test(x.label) : /End|Main Phase 2/.test(x.label))); if (ph) act({ id: ph.id }); }
      else return;
    };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  });

  if (offline) return (
    <div className="duel-offline panel"><h2>The duel engine is not running</h2>
      <p className="muted">Start it with <code>npm run dev</code> in <code>app/</code> (it starts the engine too), or open the desktop app with <code>npm run desktop</code>.</p>
      <button onClick={() => location.reload()}>Try again</button></div>
  );

  // ---------- pieces ----------
  const Card = ({ c, small }: { c: FieldCard; small?: boolean }) => {
    const k = key(c); const acts = actionsBy.has(k), sel = selectBy.get(k);
    const down = !!(c.pos & 10) && (c.loc === LOC.MZONE || c.loc === LOC.SZONE || c.loc === LOC.REMOVED || c.loc === LOC.EXTRA && false);
    const hidden = c.c === 1 && c.loc === LOC.HAND;
    return (
      <button className={`dcard${small ? " small" : ""}${c.pos & 12 && c.loc === LOC.MZONE ? " def" : ""}${acts ? " can-act" : ""}${sel ? " can-pick" : ""}${sel && (picked.includes(sel.id) || sel.selected) ? " picked" : ""}`}
        data-code={c.code} data-loc={c.loc} title={hidden ? "" : name(c.code)} onMouseEnter={() => !hidden && c.code && setDetail({ code: c.code, card: c })} onClick={(e) => clickCard(c, e)}>
        <Pic code={c.code} info={info[c.code]} faceDown={down || hidden} />
        {c.loc === LOC.MZONE && !down && c.atk !== undefined && <span className="stats">{c.atk}{info[c.code] && info[c.code].type & TYPE.LINK ? "" : `/${c.def}`}</span>}
        {c.mats.length > 0 && <span className="mats" title={c.mats.map(name).join(", ")}>{c.mats.length}</span>}
      </button>
    );
  };
  const Zone = ({ side, loc, seq, cls = "" }: { side: number; loc: number; seq: number; cls?: string }) => {
    const c = (loc === LOC.MZONE ? view!.sides[side].mzone : view!.sides[side].szone)[seq];
    const free = zoneBy.has(`${side}:${loc}:${seq}`);
    return <div className={`zone ${cls}${free ? " free" : ""}${picked.includes(zoneBy.get(`${side}:${loc}:${seq}`) ?? "-") ? " picked" : ""}`} data-zone={`${side}:${loc}:${seq}`} onClick={() => free && clickZone(side, loc, seq)}>{c && Card({ c })}</div>;
  };
  const Pile = ({ side, loc, label }: { side: number; loc: number; label: string }) => {
    const s = view!.sides[side]; const cards = loc === LOC.GRAVE ? s.grave : loc === LOC.REMOVED ? s.banished : loc === LOC.EXTRA ? s.extra : [];
    const n = loc === LOC.DECK ? s.deck : cards.length; const top = cards[cards.length - 1];
    const live = cards.some((c) => actionsBy.has(key(c)) || selectBy.has(key(c)));
    const open = loc !== LOC.DECK && (side === 0 || loc !== LOC.EXTRA);
    return (
      <div className={`zone pile${live ? " can-act" : ""}`} data-pile={`${side}:${loc}`} title={`${label}: ${n}`} onClick={() => open && n > 0 && setPile({ c: side, loc })}>
        {n > 0 && <div className="dcard"><Pic code={top?.code ?? 0} info={top && info[top.code]} faceDown={loc === LOC.DECK || loc === LOC.EXTRA || !!(top && top.pos & 10)} /></div>}
        <span className="pile-label">{label} {n}</span>
      </div>
    );
  };
  // Extra Monster Zones are shared: your zone 5 is the opponent's zone 6
  const Emz = ({ mine, theirs }: { mine: number; theirs: number }) => (view!.sides[1].mzone[theirs] ? Zone({ side: 1, loc: LOC.MZONE, seq: theirs, cls: "emz" }) : Zone({ side: 0, loc: LOC.MZONE, seq: mine, cls: "emz" }));
  const pileCards = pile && view ? (pile.loc === LOC.GRAVE ? view.sides[pile.c].grave : pile.loc === LOC.REMOVED ? view.sides[pile.c].banished : view.sides[pile.c].extra) : [];
  const d = detail && info[detail.code];
  const phases = ["Draw Phase", "Standby Phase", "Main Phase 1", "Battle Phase", "Main Phase 2", "End Phase"];
  const phaseNow = view && /Battle|Damage/.test(view.phase) ? "Battle Phase" : view?.phase;
  const depth = (s: SaveMeta): number => { const par = saves.saves.find((x) => x.id === s.parent); return par ? 1 + depth(par) : 0; };

  return (
    <div className="duel" onContextMenu={(e) => { e.preventDefault(); cancel(); }}>
      {/* left: card detail + chat, like EDOPro */}
      <aside className="duel-left">
        <div className="detail" data-testid="card-detail">
          {d ? <>
            <div className="detail-pic"><Pic code={d.id} info={d} /></div>
            <div className="detail-name">{d.name}</div>
            <div className="detail-type">{typeLine(d)}</div>
            {d.type & TYPE.MONSTER ? <div className="detail-stats">{d.type & TYPE.XYZ ? "Rank" : d.type & TYPE.LINK ? "Link" : "Level"} {d.level} · ATK {detail!.card?.atk ?? d.atk}{d.type & TYPE.LINK ? "" : ` / DEF ${detail!.card?.def ?? d.def}`}</div> : null}
            {detail!.card && detail!.card.mats.length > 0 && <div className="detail-mats">Materials ({detail!.card.mats.length}): {detail!.card.mats.map(name).join(", ")}</div>}
            <div className="detail-text">{d.desc}</div>
          </> : <p className="muted small">Point at a card to read it.</p>}
        </div>
        <div className="chat" data-testid="chat">
          <div className="chat-log" ref={logRef}>
            {view?.log.map((l, i) => <div key={i} className={`l-${l.kind}`}>{l.text}</div>)}
            {view?.notes.map((n, i) => <div key={`n${i}`} className="l-note">Note (decision {n.decisions}): {n.text}</div>)}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (note.trim() && view) { run(() => api.note(note.trim())); setNote(""); } }}>
            <input className="text" placeholder="Add a note at this point…" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
          </form>
        </div>
      </aside>

      <main className="duel-main">
        <div className="toolbar">
          <button onClick={() => setSetup(true)}>New duel…</button>
          <button className="ghost" onClick={newHand} title="N">New hand</button>
          <button className="ghost" disabled={!view?.canUndo} onClick={() => run(() => api.undo(view!.decisions))}>Restart hand</button>
          <button className="ghost" disabled={!view?.canUndo} onClick={() => run(() => api.undo())} title="Ctrl+Z or U">Undo</button>
          <button className="ghost" disabled={!view} onClick={quickSave} title="S">Quick save</button>
          <button className="ghost" disabled={!saves.saves.length} onClick={quickLoad} title="L">Quick load</button>
          <button className="ghost" onClick={() => { refreshSaves(); setShowSaves(!showSaves); }}>Save states ({saves.saves.length})</button>
          {view && <>
            <label className="tog" title="Pick the zone for you (Extra Monster Zone first)"><input type="checkbox" checked={view.settings.autoPlace} onChange={(e) => run(() => api.settings({ autoPlace: e.target.checked }))} /> Auto-place</label>
            <label className="tog" title="Never ask about optional chains"><input type="checkbox" checked={view.settings.noChain} onChange={(e) => run(() => api.settings({ noChain: e.target.checked }))} /> Ignore chains</label>
          </>}
        </div>
        {error && <div className="duel-error" role="alert">{error}</div>}

        {view && <>
          <div className="statusbar">
            <span className="lp opp" data-testid="lp-opp">Opponent {view.lp[1]}</span>
            <div className="phases">{phases.map((ph) => {
              const target = p?.phases?.find((x) => (ph === "Battle Phase" && /Battle/.test(x.label)) || (ph === "Main Phase 2" && /Main Phase 2/.test(x.label)) || (ph === "End Phase" && /End/.test(x.label)));
              return <button key={ph} className={`phase${ph === phaseNow ? " now" : ""}${target ? " go" : ""}`} disabled={!target} onClick={() => target && act({ id: target.id })} title={target ? (ph === "End Phase" ? "End turn (E)" : ph === "Battle Phase" ? "Battle Phase (B)" : ph) : ph}>{ph.replace(" Phase", "").replace("Standby", "SP").replace("Draw", "DP").replace("Main 1", "M1").replace("Main 2", "M2").replace("Battle", "BP").replace("End", "EP")}</button>;
            })}</div>
            <span className="turn">Turn {view.turn} · {view.turnPlayer === 0 ? "your turn" : "opponent"} · summons {view.summons}</span>
            <span className="lp me" data-testid="lp-me">You {view.lp[0]}</span>
          </div>

          <div className="hand opp">{view.sides[1].hand.map((c, i) => <Fragment key={i}>{Card({ c, small: true })}</Fragment>)}</div>
          <div className="mat-wrap"><div className="mat" data-testid="field">
            {Pile({ side: 1, loc: LOC.DECK, label: "Deck" })}{[4, 3, 2, 1, 0].map((s) => <Fragment key={s}>{Zone({ side: 1, loc: LOC.SZONE, seq: s, cls: "st opp" })}</Fragment>)}{Pile({ side: 1, loc: LOC.EXTRA, label: "Extra" })}
            {Pile({ side: 1, loc: LOC.GRAVE, label: "GY" })}{[4, 3, 2, 1, 0].map((s) => <Fragment key={s}>{Zone({ side: 1, loc: LOC.MZONE, seq: s, cls: "mz opp" })}</Fragment>)}{Zone({ side: 1, loc: LOC.SZONE, seq: 5, cls: "fz opp" })}
            {Pile({ side: 1, loc: LOC.REMOVED, label: "Banished" })}<div />{Emz({ mine: 5, theirs: 6 })}<div className="chain-box">{view.chain.length > 0 && <>Chain {view.chain.length}<br /><small>{name(view.chain[view.chain.length - 1].code)}</small></>}</div>{Emz({ mine: 6, theirs: 5 })}<div />{Pile({ side: 0, loc: LOC.REMOVED, label: "Banished" })}
            {Zone({ side: 0, loc: LOC.SZONE, seq: 5, cls: "fz" })}{[0, 1, 2, 3, 4].map((s) => <Fragment key={s}>{Zone({ side: 0, loc: LOC.MZONE, seq: s, cls: "mz" })}</Fragment>)}{Pile({ side: 0, loc: LOC.GRAVE, label: "GY" })}
            {Pile({ side: 0, loc: LOC.EXTRA, label: "Extra" })}{[0, 1, 2, 3, 4].map((s) => <Fragment key={s}>{Zone({ side: 0, loc: LOC.SZONE, seq: s, cls: "st" })}</Fragment>)}{Pile({ side: 0, loc: LOC.DECK, label: "Deck" })}
          </div></div>
          <div className="hand me" data-testid="hand">{view.sides[0].hand.map((c, i) => <Fragment key={i}>{Card({ c })}</Fragment>)}</div>

          <div className="hint" data-testid="hint">{view.ended ? "The duel is over." : !p ? "" : p.kind === "idle" ? `${p.title}: click a glowing card for its actions, or a phase button.` : p.kind === "place" ? `${p.title} (glowing zones)` : p.title}</div>

          {/* prompt windows */}
          {p && p.kind !== "idle" && p.kind !== "place" && (
            <div className="window" role="dialog" aria-label={p.title} data-testid="prompt">
              <h3>{p.title}</h3>
              {p.text && <p className="small">{p.text}</p>}
              {p.kind === "yesno" && <div className="row"><button onClick={() => act({ yes: true })}>Yes</button><button className="ghost" onClick={() => act({ yes: false })}>No</button></div>}
              {(p.kind === "options" || p.kind === "position") && <div className="opts">{(p.options ?? p.positions)!.map((o) => <button key={o.id} className="ghost" onClick={() => act({ id: o.id })}>{o.label}</button>)}</div>}
              {(p.kind === "cards" || p.kind === "chain") && <>
                {p.kind === "cards" && !p.oneByOne && (p.max ?? 1) > 1 && <p className="small muted">Pick {p.min === p.max ? p.min : `${p.min} to ${p.max}`} · {picked.length} picked</p>}
                <div className="pick-grid">
                  {p.cards!.map((c) => (
                    <button key={c.id} className={`pick${picked.includes(c.id) || c.selected ? " picked" : ""}`} onMouseEnter={() => setDetail({ code: c.code })} onClick={() => choose(c)}>
                      <Pic code={c.code} info={info[c.code]} /><span>{name(c.code)}</span><small>{c.c === 1 ? "Opponent · " : ""}{LOC_LABEL[c.loc & 0x7f] ?? ""}{c.desc ? ` · ${c.desc.slice(0, 60)}` : ""}</small>
                    </button>
                  ))}
                </div>
                <div className="row">
                  {p.kind === "cards" && !p.oneByOne && (p.max ?? 1) > 1 && <button disabled={!canConfirm} onClick={confirm}>Confirm</button>}
                  {p.finish && <button onClick={() => act({ finish: true })}>Done</button>}
                  {p.kind === "chain" && !p.forced && <button className="ghost" onClick={() => act({ cancel: true })}>Don't chain</button>}
                  {p.kind === "cards" && p.cancel && <button className="ghost" onClick={() => act({ cancel: true })}>Cancel</button>}
                </div>
              </>}
            </div>
          )}
        </>}

        {menu && <div className="act-menu" style={{ left: menu.x, top: menu.y }} role="menu">
          {menu.actions.map((a) => <button key={a.id} role="menuitem" onClick={() => act({ id: a.id })}>{a.verb}{a.desc && menu.actions.filter((x) => x.verb === a.verb).length > 1 ? `: ${a.desc.slice(0, 70)}` : ""}</button>)}
        </div>}

        {pile && view && <div className="window pile-view" role="dialog" aria-label="Cards in pile">
          <h3>{pile.c === 1 ? "Opponent's " : "Your "}{LOC_LABEL[pile.loc]} ({pileCards.length}) <button className="x" aria-label="Close" onClick={() => setPile(null)}>×</button></h3>
          <div className="pick-grid">{pileCards.map((c, i) => <div key={i} className="pick">{Card({ c })}<span>{name(c.code)}</span></div>)}</div>
        </div>}

        {showSaves && <div className="window saves" role="dialog" aria-label="Save states">
          <h3>Save states <button className="x" aria-label="Close" onClick={() => setShowSaves(false)}>×</button></h3>
          <p className="small muted">Each save is the whole duel up to that point. Loading one and playing on makes a branch.</p>
          {saves.saves.length === 0 && <p className="muted small">Nothing saved yet. Press S or Quick save.</p>}
          {saves.saves.map((s) => (
            <div key={s.id} className={`save-row${s.id === saves.current ? " current" : ""}`} style={{ paddingLeft: 8 + depth(s) * 18 }}>
              <span>{depth(s) > 0 ? "↳ " : ""}{s.name}</span><small className="muted">turn {s.turn} · {s.decisions} decisions</small>
              <button className="link" onClick={() => run(() => api.load(s.id)).then(refreshSaves)}>Load</button>
              <button className="x" aria-label={`Delete ${s.name}`} onClick={() => api.deleteSave(s.id).then(setSaves)}>×</button>
            </div>
          ))}
          {view && <form className="row" onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget.elements.namedItem("n") as HTMLInputElement; api.save(f.value || undefined).then(setSaves); f.value = ""; }}>
            <input className="text" name="n" placeholder="Name this point (optional)" aria-label="Save name" /><button>Save here</button></form>}
        </div>}

        {setup && <Setup labDeck={labDeck} packDeck={packDeck} last={last()} info={info} setInfo={setInfo} onStart={start} onClose={view ? () => setSetup(false) : undefined} />}
      </main>
    </div>
  );
}

/** New duel: pick the deck (deck lab, current list, or a .ydk from EDOPro's deck folder) and, if you want, the opening hand. */
function Setup({ labDeck, packDeck, last, info, setInfo, onStart, onClose }: {
  labDeck: DuelDeck | null; packDeck: DuelDeck; last: { deck: DuelDeck; hand: number[] } | null; info: Record<number, CardInfo>;
  setInfo: (f: (o: Record<number, CardInfo>) => Record<number, CardInfo>) => void; onStart: (d: DuelDeck, hand: number[]) => void; onClose?: () => void;
}) {
  const [deck, setDeck] = useState<DuelDeck>(last?.deck ?? labDeck ?? packDeck);
  const [hand, setHand] = useState<number[]>(last?.hand ?? []);
  const [edo, setEdo] = useState<string[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => { api.decks().then((r) => setEdo(r.decks)).catch(() => {}); }, []);
  useEffect(() => { const need = [...new Set(deck.main)].filter((id) => !info[id]); if (need.length) api.cards(need).then((r) => setInfo((o) => ({ ...o, ...Object.fromEntries(r.cards.map((c) => [c.id, c])) }))).catch(() => {}); }, [deck]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (d: DuelDeck) => { setDeck(d); setHand([]); setErr(""); };
  const counts = new Map<number, number>(); for (const c of deck.main) counts.set(c, (counts.get(c) ?? 0) + 1);
  const inHand = (id: number) => hand.filter((x) => x === id).length;
  return (
    <div className="window setup" role="dialog" aria-label="New duel">
      <h3>New duel {onClose && <button className="x" aria-label="Close" onClick={onClose}>×</button>}</h3>
      <div className="row">
        <button className={deck.name === packDeck.name ? "" : "ghost"} onClick={() => pick(packDeck)}>My current list</button>
        {labDeck && <button className={deck.name === labDeck.name ? "" : "ghost"} onClick={() => pick(labDeck)}>Deck lab deck</button>}
        <select aria-label="EDOPro deck" value={edo.includes(deck.name) ? deck.name : ""} onChange={async (e) => {
          if (!e.target.value) return;
          try { const r = await api.readDeck(e.target.value); const y = parseYdk(r.text); pick({ name: r.name, main: y.main, extra: y.extra }); } catch (x) { setErr((x as Error).message); }
        }}><option value="">{edo.length ? `EDOPro deck folder (${edo.length})…` : "No EDOPro deck folder found"}</option>{edo.map((n) => <option key={n}>{n}</option>)}</select>
      </div>
      <p className="small muted"><b>{deck.name}</b> · Main {deck.main.length} · Extra {deck.extra.length}. Opening hand: {hand.length === 0 ? "5 random cards" : `${hand.length} chosen + ${5 - hand.length} random`}. Click cards to put them in the opening hand.</p>
      <div className="setup-cards">
        {[...counts].map(([id, n]) => (
          <button key={id} className={`chip${inHand(id) ? " on" : ""}`} onClick={() => setHand(inHand(id) >= n || hand.length >= 5 ? hand.filter((x) => x !== id) : [...hand, id])}>
            {inHand(id) > 0 && <b>{inHand(id)}× </b>}{info[id]?.name ?? id}
          </button>
        ))}
      </div>
      {err && <p className="error">{err}</p>}
      <div className="row"><button onClick={() => onStart(deck, hand)}>Start duel</button>{hand.length > 0 && <button className="ghost" onClick={() => setHand([])}>Random hand</button>}</div>
    </div>
  );
}

export type { Prompt, Side };
