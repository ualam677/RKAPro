/** Deck version history: every edit is kept with the numbers it produced, so a change can be judged and undone. */
export interface Version {
  t: number;
  main: Record<number, number>;
  extra: number[];
  side: number[];
  /** label -> probability, several numbers (never one score) */
  stats: Record<string, number>;
  /** what changed against the version before, e.g. "+1 Galaxy Wizard, −1 Photon Thrasher" */
  note: string;
}
export const HISTORY_KEY = "rkapro-history-v1";
const MAX = 200;

const clean = (m: Record<number, number>) => Object.fromEntries(Object.entries(m).filter(([, n]) => n > 0));
export const sameMain = (a: Record<number, number>, b: Record<number, number>) => {
  const x = clean(a), y = clean(b); const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  return [...keys].every((k) => (x[k as unknown as number] ?? 0) === (y[k as unknown as number] ?? 0));
};

export function describeChange(prev: Record<number, number> | null, next: Record<number, number>, nameOf: (id: number) => string): string {
  const size = Object.values(next).reduce((a, b) => a + b, 0);
  if (!prev) return `Imported (${size} cards)`;
  const ids = [...new Set([...Object.keys(prev), ...Object.keys(next)])].map(Number);
  const parts = ids.map((id) => [id, (next[id] ?? 0) - (prev[id] ?? 0)] as const).filter(([, d]) => d !== 0)
    .sort((a, b) => b[1] - a[1]).map(([id, d]) => `${d > 0 ? "+" : "−"}${Math.abs(d)} ${nameOf(id)}`);
  return parts.length > 6 ? `${parts.length} cards changed (${size} cards)` : parts.join(", ");
}

/** Append a version unless the Main Deck is the same as the newest one. Newest last; capped. */
export function pushVersion(list: Version[], v: Omit<Version, "note">, nameOf: (id: number) => string, fresh = false): Version[] {
  const last = list[list.length - 1];
  if (last && sameMain(last.main, v.main)) return list;
  const note = describeChange(fresh || !last ? null : last.main, v.main, nameOf);
  return [...list, { ...v, main: clean(v.main), note }].slice(-MAX);
}

export const loadHistory = (): Version[] => { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]"); } catch { return []; } };
export const saveHistory = (h: Version[]) => { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch { /* storage unavailable */ } };
