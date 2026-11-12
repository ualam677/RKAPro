// Typed client for the local duel server (sim/server.mjs). The UI holds no game logic: it shows `View` and sends answers.

export interface FieldCard { code: number; pos: number; atk?: number; def?: number; level: number; mats: number[]; counters?: Record<number, number>; c: number; loc: number; seq: number }
export interface Side { hand: FieldCard[]; mzone: (FieldCard | null)[]; szone: (FieldCard | null)[]; grave: FieldCard[]; banished: FieldCard[]; extra: FieldCard[]; deck: number }
export interface CardRef { id: string; code: number; c: number; loc: number; seq: number; pos?: number; verb?: string; desc?: string; selected?: boolean }
export interface Choice { id: string; label: string }
export interface Prompt {
  kind: "idle" | "yesno" | "options" | "cards" | "chain" | "place" | "position"; player: number; type: number; title: string; text?: string;
  actions?: CardRef[]; phases?: Choice[]; options?: Choice[]; positions?: Choice[]; code?: number; card?: CardRef;
  cards?: CardRef[]; min?: number; max?: number; cancel?: boolean; finish?: boolean; oneByOne?: boolean; forced?: boolean;
  zones?: { id: string; c: number; loc: number; seq: number }[]; count?: number;
}
export interface LogLine { kind: "turn" | "phase" | "move" | "summon" | "chain" | "warn" | "lp" | "window"; text: string; turn: number }
export interface View {
  none?: boolean; turn: number; turnPlayer: number; phase: string; lp: [number, number]; chain: { code: number; c: number }[]; log: LogLine[]; summons: number; winner: number | null;
  ended: boolean; sides: [Side, Side]; prompt: Prompt | null; steps: number; canUndo: boolean; decisions: number;
  settings: { autoPlace: boolean; noChain: boolean; alwaysChain: boolean }; drill: { graded: boolean } | null; notes: { decisions: number; text: string }[]; save: string | null; engineErrors: string[];
}
export interface CardInfo { id: number; name: string; desc: string; type: number; atk?: number; def?: number; level?: number; attribute?: number; race?: number }
export interface SaveMeta { id: string; name: string; parent: string | null; created: number; turn: number; decisions: number; steps: number }
export interface Step { k: "summon" | "activate"; name: string }
export interface Grade {
  hand: string[]; class: string | null; verdict: "better" | "matched" | "below" | "expected brick"; storedSource: string;
  board: { yours: number; stored: number; parts: string[]; full: boolean; storedFull: boolean };
  nibiru: { yours: boolean; stored: boolean; why: string }; handTrapsKept: number; summons: number;
  line: { followed: number; total: number; yours: number; source: string; deviation: { at: number; stored: Step | null; yours: Step | null } | null } | null;
}
type Rate = { yours: number; odds: number | null };
export interface Summary { drills: number; fullBoard: Rate; nibiruProof: Rate; brick: Rate; verdicts: Record<string, number>; modelMissed: { hand: string[]; board: number }[] }
export interface DrillResult { grade: Grade; summary: Summary }
export type Answer = { id: string } | { ids: string[] } | { yes: boolean } | { cancel: true } | { finish: true };

async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/${path}`, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: `The duel server did not answer (${r.status})` }));
  if (!r.ok) throw Object.assign(new Error(j.error ?? "Request failed"), { state: j.state as View | undefined });
  return j as T;
}

export const api = {
  meta: () => call<{ edopro: string | null; cards: number }>("meta"),
  state: () => call<View>("duel"),
  newDuel: (q: { main: number[]; extra: number[]; hand?: number[]; seed?: number; handSize?: number; shuffle?: boolean }) => call<View>("duel/new", q),
  writeDeck: (name: string, text: string, overwrite = false) => call<{ saved?: string; exists?: boolean; name?: string }>("decks/write", { name, text, overwrite }),
  act: (a: Answer) => call<View>("duel/act", a),
  undo: (n = 1) => call<View>("duel/undo", { n }),
  settings: (s: Partial<View["settings"]>) => call<View>("duel/settings", s),
  note: (text: string) => call<View>("duel/note", { text }),
  saves: () => call<{ saves: SaveMeta[]; current: string | null }>("saves"),
  save: (name?: string) => call<{ saved: SaveMeta; saves: SaveMeta[]; current: string | null }>("saves", { name }),
  load: (id: string) => call<View>("saves/load", { id }),
  deleteSave: (id: string) => call<{ saves: SaveMeta[]; current: string | null }>("saves/delete", { id }),
  drillNew: (q: { main: number[]; extra: number[] }) => call<View>("drill/new", q),
  drillFinish: () => call<DrillResult>("drill/finish", {}),
  drillPromote: () => call<DrillResult & { line: { id: string; class: string; board: number; nib: boolean; steps: number } }>("drill/promote", {}),
  drillWhy: (text: string) => call<{ saved: string }>("drill/why", { text }),
  wrong: (kind: string, text: string, card: string | null) => call<{ saved: string }>("wrong", { kind, text, card }),
  knowledge: () => call<{ roles: Record<string, string[]>; lines: { id: string; class: string; source: string; legal: boolean; board: number; nib: boolean; steps: number }[] }>("knowledge"),
  setRole: (name: string, roles: string[]) => call<{ roles: Record<string, string[]> }>("knowledge/role", { name, roles }),
  cards: (ids: number[]) => call<{ cards: CardInfo[] }>("cards", { ids }),
  decks: () => call<{ folder: string | null; decks: string[] }>("decks"),
  readDeck: (name: string) => call<{ name: string; text: string }>("decks/read", { name }),
};

export const TYPE = { MONSTER: 0x1, SPELL: 0x2, TRAP: 0x4, NORMAL: 0x10, EFFECT: 0x20, FUSION: 0x40, RITUAL: 0x80, SYNCHRO: 0x2000, TOKEN: 0x4000, QUICKPLAY: 0x10000, CONTINUOUS: 0x20000, EQUIP: 0x40000, FIELD: 0x80000, COUNTER: 0x100000, TUNER: 0x1000, XYZ: 0x800000, PENDULUM: 0x1000000, LINK: 0x4000000 };
export const LOC = { DECK: 1, HAND: 2, MZONE: 4, SZONE: 8, GRAVE: 16, REMOVED: 32, EXTRA: 64 };
export const LOC_LABEL: Record<number, string> = { 1: "Deck", 2: "Hand", 4: "Field", 8: "S/T", 16: "GY", 32: "Banished", 64: "Extra" };
