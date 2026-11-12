import data from "../../data/cards.json";

/**
 * Card database bundled into the app (built by scripts/build_cards.py from
 * EDOPro's BabelCDB + the TCG banlist). No network needed, so it works inside
 * a sandboxed artifact and offline.
 */
export type CardKind = "monster" | "spell" | "trap" | "extra";
export type Attribute = "EARTH" | "WATER" | "FIRE" | "WIND" | "LIGHT" | "DARK" | "DIVINE";

export interface Card {
  id: number;
  name: string;
  kind: CardKind;
  /** EDOPro type bitmask (Effect, Tuner, Quick-Play, ...). */
  type: number;
  attribute?: Attribute;
  race?: string;
  level?: number;
  /** TCG limit: 0 forbidden, 1 limited, 2 semi-limited; undefined = unlimited. */
  limit?: 0 | 1 | 2;
}

export interface CardDb {
  byId: Map<number, Card>;
  byName: Map<string, Card>; // normalised name -> card
  banlist: string;
}

const KINDS: CardKind[] = ["monster", "monster", "spell", "trap", "extra"];
const ATTRS: [number, Attribute][] = [[1, "EARTH"], [2, "WATER"], [4, "FIRE"], [8, "WIND"], [16, "LIGHT"], [32, "DARK"], [64, "DIVINE"]];
const RACES = ["Warrior", "Spellcaster", "Fairy", "Fiend", "Zombie", "Machine", "Aqua", "Pyro", "Rock", "Winged Beast",
  "Plant", "Insect", "Thunder", "Dragon", "Beast", "Beast-Warrior", "Dinosaur", "Fish", "Sea Serpent", "Reptile",
  "Psychic", "Divine-Beast", "Creator God", "Wyrm", "Cyberse", "Illusion"];

export const TYPE = { MONSTER: 0x1, SPELL: 0x2, TRAP: 0x4, TUNER: 0x1000, QUICKPLAY: 0x10000, COUNTER: 0x100000 } as const;

export const isExtraDeckCard = (c: Pick<Card, "kind">) => c.kind === "extra";
export const isMonster = (c: Pick<Card, "kind">) => c.kind === "monster" || c.kind === "extra";

export const normaliseName = (n: string) =>
  n.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[‘’“”"']/g, "").replace(/[^a-z0-9]+/g, " ").trim();

let cached: CardDb | null = null;

export function loadCardDb(): CardDb {
  if (cached) return cached;
  const ban = data.ban as Record<string, number>;
  const byId = new Map<number, Card>();
  const byName = new Map<string, Card>();
  for (const [id, name, kind, type, attr, race, level] of data.cards as number[][]) {
    const card: Card = { id, name: name as unknown as string, kind: KINDS[kind], type };
    if (attr) card.attribute = ATTRS.find(([b]) => attr & b)?.[1];
    if (race) card.race = RACES[Math.log2(race & -race)];
    if (level) card.level = level;
    const l = ban[String(id)];
    if (l !== undefined) card.limit = l as 0 | 1 | 2;
    byId.set(id, card);
    byName.set(normaliseName(card.name), card);
  }
  for (const [alt, base] of Object.entries(data.alias as Record<string, number>)) {
    const card = byId.get(base);
    if (card) byId.set(Number(alt), card);
  }
  cached = { byId, byName, banlist: data.list };
  return cached;
}

/** Exact normalised match, then a unique prefix match. */
export function findByName(db: Pick<CardDb, "byName">, name: string): Card | undefined {
  const n = normaliseName(name);
  const exact = db.byName.get(n);
  if (exact || n.length < 4) return exact;
  let hit: Card | undefined;
  for (const [k, c] of db.byName) {
    if (k.startsWith(n)) { if (hit) return undefined; hit = c; }
  }
  return hit;
}

/** "Did you mean…?" — best card names by shared words, for names that didn't match. */
export function suggestNames(db: Pick<CardDb, "byName">, name: string, max = 3): string[] {
  const words = new Set(normaliseName(name).split(" ").filter((w) => w.length > 2));
  if (!words.size) return [];
  const scored: [number, string][] = [];
  for (const [k, c] of db.byName) {
    const kw = k.split(" ");
    let hits = 0;
    for (const w of kw) if (words.has(w) || [...words].some((x) => x.length > 4 && (w.startsWith(x) || x.startsWith(w)))) hits++;
    if (hits) scored.push([hits / Math.max(words.size, kw.length) + hits * 0.01, c.name]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, max).map(([, n]) => n);
}
