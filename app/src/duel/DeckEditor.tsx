import { useEffect, useMemo, useState } from "react";
import { Card, CardDb, isExtraDeckCard, isMonster, RACES } from "../lib/cards/db";
import { importDeck } from "../lib/cards/resolve";
import { Deck } from "../lib/deck/types";
import { toYdk } from "../lib/deck/ydk";
import { api, CardInfo, TYPE } from "./api";
import { Pic, typeLine } from "./Duel";

type Zone = "main" | "extra" | "side";
const CAP: Record<Zone, number> = { main: 60, extra: 15, side: 15 };
const LIMIT = ["Forbidden", "Limited", "Semi-Limited"];
const ATTRS = ["EARTH", "WATER", "FIRE", "WIND", "LIGHT", "DARK", "DIVINE"];
const KIND_ORDER = { monster: 0, spell: 1, trap: 2, extra: 3 };

/**
 * Deck editor, laid out like EDOPro's: card text on the left, the deck in the middle, search on the right.
 * Left-click a search result to add it (Extra Deck cards go to the Extra Deck), right-click to add it to the Side Deck.
 * Left-click a card in the deck to remove it, right-click to move it between Main and Side.
 */
export function DeckEditor({ deck, db, onChange }: { deck: Deck; db: CardDb; onChange: (d: Deck) => void }) {
  // byId also maps alternate-art passcodes to the same card: list every card once
  const all = useMemo(() => [...new Map([...db.byId.values()].map((c) => [c.id, c])).values()].filter((c) => !(c.type & TYPE.TOKEN)).sort((a, b) => a.name.localeCompare(b.name)), [db]);
  const [q, setQ] = useState(""); const [kind, setKind] = useState(""); const [attr, setAttr] = useState(""); const [level, setLevel] = useState(""); const [race, setRace] = useState("");
  const [detail, setDetail] = useState<number | null>(null);
  const [texts, setTexts] = useState<Record<number, CardInfo>>({});
  const [name, setName] = useState(deck.name ?? "New deck");
  const [edo, setEdo] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3500); };
  const refreshDecks = () => api.decks().then((r) => setEdo(r.decks)).catch(() => {});
  useEffect(() => { refreshDecks(); }, []);
  useEffect(() => { if (detail && !texts[detail]) api.cards([detail]).then((r) => setTexts((t) => ({ ...t, [detail]: r.cards[0] }))).catch(() => {}); }, [detail]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length && !kind && !attr && !level && !race) return [];
    const out: Card[] = [];
    for (const c of all) {
      if (kind && (kind === "monster" ? c.kind !== "monster" : c.kind !== kind)) continue;
      if (attr && c.attribute !== attr) continue;
      if (level && c.level !== Number(level)) continue;
      if (race && c.race !== race) continue;
      const n = c.name.toLowerCase(); if (!words.every((w) => n.includes(w))) continue;
      out.push(c); if (out.length >= 120) break;
    }
    return out;
  }, [q, kind, attr, level, race, all]);

  const copies = (id: number) => [...deck.main, ...deck.extra, ...deck.side].filter((x) => x === id).length;
  const sorted = (ids: number[]) => [...ids].sort((a, b) => {
    const x = db.byId.get(a), y = db.byId.get(b); if (!x || !y) return a - b;
    return KIND_ORDER[x.kind] - KIND_ORDER[y.kind] || (y.level ?? 0) - (x.level ?? 0) || x.name.localeCompare(y.name) || a - b;
  });
  const set = (d: Partial<Deck>) => onChange({ ...deck, ...d, name });
  function add(c: Card, toSide: boolean) {
    const cap = c.limit ?? 3;
    if (copies(c.id) >= cap) return say(cap === 3 ? `Already 3 copies of ${c.name}` : `${c.name} is ${LIMIT[cap]} (max ${cap})`);
    const zone: Zone = toSide ? "side" : isExtraDeckCard(c) ? "extra" : "main";
    if (deck[zone].length >= CAP[zone]) return say(`The ${zone === "main" ? "Main" : zone === "extra" ? "Extra" : "Side"} Deck is full (${CAP[zone]})`);
    set({ [zone]: [...deck[zone], c.id] });
  }
  const remove = (zone: Zone, i: number) => set({ [zone]: deck[zone].filter((_, j) => j !== i) });
  function move(zone: Zone, i: number) { // right-click: Main/Extra <-> Side
    const id = deck[zone][i]; const c = db.byId.get(id);
    const to: Zone = zone === "side" ? (c && isExtraDeckCard(c) ? "extra" : "main") : "side";
    if (deck[to].length >= CAP[to]) return say("No room there");
    onChange({ ...deck, name, [zone]: deck[zone].filter((_, j) => j !== i), [to]: [...deck[to], id] });
  }
  async function load(file: string) {
    try { const r = await api.readDeck(file); const d = importDeck(r.text, db, r.name).deck; setName(file.replace(/\.ydk$/i, "")); onChange({ ...d, name: file.replace(/\.ydk$/i, "") }); }
    catch (e) { say((e as Error).message); }
  }
  async function save() {
    try {
      let r = await api.writeDeck(name, toYdk(deck));
      if (r.exists) { if (!window.confirm(`${r.name} already exists in EDOPro's deck folder. Replace it?`)) return; r = await api.writeDeck(name, toYdk(deck), true); }
      say(`Saved ${r.saved} to EDOPro's deck folder`); refreshDecks();
    } catch (e) { say((e as Error).message); }
  }
  const dc = detail ? db.byId.get(detail) : null; const dt = detail ? texts[detail] : null;
  const asInfo = (c?: Card): CardInfo | undefined => (c ? { id: c.id, name: c.name, desc: "", type: c.type } : undefined);
  const monsters = deck.main.filter((id) => db.byId.get(id)?.kind === "monster").length, spells = deck.main.filter((id) => db.byId.get(id)?.kind === "spell").length;

  const Section = (zone: Zone, title: string) => (
    <div className={`ed-zone ed-${zone}`} data-testid={`ed-${zone}`}>
      <div className="ed-zone-title">{title} <b>{deck[zone].length}</b>{zone === "main" && <span className="muted"> · {monsters} monsters · {spells} spells · {deck.main.length - monsters - spells} traps</span>}</div>
      <div className="ed-grid">
        {deck[zone].map((id, i) => {
          const c = db.byId.get(id);
          return (
            <button key={`${id}-${i}`} className="ecard" title={c?.name ?? String(id)} onMouseEnter={() => setDetail(id)} onClick={() => remove(zone, i)} onContextMenu={(e) => { e.preventDefault(); move(zone, i); }}>
              <Pic code={id} info={asInfo(c)} />{c?.limit !== undefined && <span className={`limit l${c.limit}`}>{c.limit}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="editor">
      <aside className="detail" data-testid="ed-detail">
        {dc ? <>
          <div className="detail-pic"><Pic code={dc.id} info={asInfo(dc)} /></div>
          <div className="detail-name">{dc.name}</div>
          {dt && <div className="detail-type">{typeLine(dt)}</div>}
          {dt && isMonster(dc) && <div className="detail-stats">{dc.type & TYPE.XYZ ? "Rank" : dc.type & TYPE.LINK ? "Link" : "Level"} {dc.level} · ATK {dt.atk}{dc.type & TYPE.LINK ? "" : ` / DEF ${dt.def}`}</div>}
          {dc.limit !== undefined && <div className="detail-mats">{LIMIT[dc.limit]} ({db.banlist})</div>}
          <div className="detail-text">{dt?.desc ?? ""}</div>
        </> : <p className="muted small">Point at a card to read it.</p>}
      </aside>

      <main className="ed-deck">
        <div className="toolbar">
          <input className="text" aria-label="Deck name" value={name} onChange={(e) => setName(e.target.value)} />
          <select aria-label="Open EDOPro deck" value="" onChange={(e) => e.target.value && load(e.target.value)}>
            <option value="">{edo.length ? `Open from EDOPro (${edo.length})…` : "No EDOPro deck folder"}</option>{edo.map((n) => <option key={n}>{n}</option>)}
          </select>
          <button onClick={save} disabled={!deck.main.length}>Save to EDOPro</button>
          <button className="ghost" onClick={() => set({ main: sorted(deck.main), extra: sorted(deck.extra), side: sorted(deck.side) })}>Sort</button>
          <button className="ghost" onClick={() => { if (window.confirm("Remove every card from this deck?")) onChange({ main: [], extra: [], side: [], name }); }}>Clear</button>
          {msg && <span className="ed-msg" role="status">{msg}</span>}
        </div>
        {Section("main", "Main Deck")}{Section("extra", "Extra Deck")}{Section("side", "Side Deck")}
        <p className="muted small">Click a card to remove it, right-click to move it between Main and Side. The deck lab and the duel use this deck.</p>
      </main>

      <aside className="ed-search">
        <input className="text" placeholder="Search card name…" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div className="ed-filters">
          <select aria-label="Card type" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Any card</option><option value="monster">Monster</option><option value="spell">Spell</option><option value="trap">Trap</option><option value="extra">Extra Deck</option></select>
          <select aria-label="Attribute" value={attr} onChange={(e) => setAttr(e.target.value)}><option value="">Attribute</option>{ATTRS.map((a) => <option key={a}>{a}</option>)}</select>
          <select aria-label="Level or Rank" value={level} onChange={(e) => setLevel(e.target.value)}><option value="">Level/Rank</option>{Array.from({ length: 13 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select>
          <select aria-label="Monster type" value={race} onChange={(e) => setRace(e.target.value)}><option value="">Type</option>{[...RACES].sort().map((r) => <option key={r}>{r}</option>)}</select>
        </div>
        <div className="muted small">{results.length ? `${results.length}${results.length >= 120 ? "+" : ""} cards · click = add · right-click = Side Deck` : "Type a name or pick a filter."}</div>
        <div className="ed-results" data-testid="ed-results">
          {results.map((c) => (
            <button key={c.id} className="ed-result" onMouseEnter={() => setDetail(c.id)} onClick={() => add(c, false)} onContextMenu={(e) => { e.preventDefault(); add(c, true); }}>
              <Pic code={c.id} info={asInfo(c)} />
              <span><b>{c.name}</b><small>{isMonster(c) ? `${c.attribute ?? ""} ${c.race ?? ""} ${c.type & TYPE.XYZ ? "Rank" : "Lv"} ${c.level ?? ""}` : c.kind}{copies(c.id) ? ` · ${copies(c.id)} in deck` : ""}</small></span>
              {c.limit !== undefined && <span className={`limit l${c.limit}`}>{c.limit}</span>}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
