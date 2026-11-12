import { Card, normaliseName } from "../cards/db";
import { KNOWN_BOARD_BREAKERS, KNOWN_HAND_TRAPS, Role, ROLES } from "../roles";
import { Effects, Goal, Line, Requirement, Zone } from "./engine";
import { DeckEntry } from "./filters";

/** What the user says about each card. Kept tiny so it saves/shares easily. */
export interface CardSetup {
  /** One or more roles; empty = "Other". */
  roles: Role[];
  /** Starters: what this starter needs besides itself (in hand, in the Deck, or anywhere in the 40). */
  needs?: Requirement[];
  /** Combo pieces: where it must be, and which starters use it ("all" or starter ids). */
  zone?: Zone;
  usedBy?: "all" | number[];
  /** This card fetches a card matching `target` from the Deck (a Starter that fetches counts through what it fetches). */
  search?: string;
  /** …after discarding another card matching this from hand (Galaxy Soldier: another LIGHT monster). */
  cost?: string;
  /** …then putting a card from hand back on top of the Deck (Seventh Tachyon). */
  putBack?: boolean;
  /** Dead if drawn (counts towards "bricks in hand"). */
  brick?: boolean;
  /** Never suggest cutting this card. */
  keep?: boolean;
  /** The optimiser won't suggest adding copies beyond this (the guide plays Galaxy Soldier at exactly 1). */
  max?: number;
  /** Why the card is in the deck (shown on its tile). */
  note?: string;
  /**
   * Exact routes learned from replays. When a Starter has routes, each one is its own line
   * (this card in hand + the route's requirements) and the guessed combo-piece requirements are not added.
   */
  routes?: Route[];
}
export interface Route { name: string; reqs: Requirement[]; extra?: number[]; endBoard?: number[]; /** requirement index → card originally seen in the replay */ orig?: Record<number, number> }
export type SetupMap = Record<number, CardSetup>;

export const hasRole = (s: CardSetup | undefined, r: Role) => !!s?.roles.includes(r);

/** Roles the engine sees for a card (roles + Brick flag, or "Other"). */
export const rolesOf = (s?: CardSetup): string[] => {
  const r: string[] = s ? [...s.roles] : [];
  if (s?.brick) r.push("Brick");
  if (r.length === 0) r.push("Other");
  return r;
};

/** Old saves had a single `role` (and "Brick" as a role). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function upgradeSetup(raw: any): CardSetup {
  if (Array.isArray(raw?.roles)) return raw as CardSetup;
  const { role, ...rest } = raw ?? {};
  const roles = (ROLES as readonly string[]).includes(role) ? [role as Role] : [];
  return { ...rest, roles, brick: rest.brick || role === "Brick" };
}

const norm = (xs: string[]) => new Set(xs.map(normaliseName));
const HT = norm(KNOWN_HAND_TRAPS), BB = norm(KNOWN_BOARD_BREAKERS);

export function autoSetup(card: Card): CardSetup {
  const n = normaliseName(card.name);
  if (HT.has(n)) return { roles: ["Hand Trap"] };
  if (BB.has(n)) return { roles: ["Board Breaker"] };
  return { roles: [] };
}

/** Cards whose effect we model automatically (excavate N, add 1). */
export const EXCAVATORS: Record<string, number> = { "pot of prosperity": 6, "pot of duality": 3 };

export function buildEffects(entries: DeckEntry[], setup: SetupMap): Effects {
  const fx: Effects = { search: {}, excavate: {} };
  for (const e of entries) {
    const dig = EXCAVATORS[normaliseName(e.card.name)];
    if (dig) fx.excavate[e.id] = dig;
    const s = setup[e.id];
    if (s?.search) fx.search[e.id] = { target: s.search, usedUp: true, cost: s.cost, putBack: s.putBack };
  }
  return fx;
}

export const INTERACTION = "role:Hand Trap|role:Board Breaker";

/**
 * Turn per-card setup into goals.
 *  - Every Starter that doesn't fetch becomes a line: itself in hand + its needs + every Combo piece that starter uses.
 *  - Starters that DO fetch (Galaxy Wizard, Seventh Tachyon) have no line of their own: they count by fetching a
 *    starter whose line is then checked. That's how the guides play them.
 *  - Combo pieces cut to 0 copies make their lines impossible, so the optimiser can't cut them for free.
 *  - Hands with more than `maxBricks` dead cards count as failures.
 */
export function buildGoals(
  entries: DeckEntry[], setup: SetupMap, nameOf: (id: number) => string, opts: { maxBricks: number },
): { first: Goal; second: Goal } {
  const inMain = new Set(entries.map((e) => e.id));
  const pieces = Object.entries(setup)
    .filter(([id, s]) => hasRole(s, "Combo piece") && inMain.has(Number(id)))
    .map(([id, s]) => ({ id: Number(id), s }));

  const learned: Line[] = entries
    .filter((e) => hasRole(setup[e.id], "Starter") && setup[e.id].routes?.length)
    .flatMap((e) => setup[e.id].routes!.map((r) => ({ name: `${nameOf(e.id)} — ${r.name}`, reqs: [{ match: `card:${e.id}`, min: 1 }, ...r.reqs] })));
  const starterLines: Line[] = [...learned, ...entries
    .filter((e) => hasRole(setup[e.id], "Starter") && !setup[e.id].search && !setup[e.id].routes?.length)
    .map((e) => ({
      name: nameOf(e.id),
      reqs: [
        { match: `card:${e.id}`, min: 1 },
        ...(setup[e.id].needs ?? []),
        ...pieces
          .filter((p) => p.id !== e.id && ((p.s.usedBy ?? "all") === "all" || (p.s.usedBy as number[]).includes(e.id)))
          .map((p) => ({ match: `card:${p.id}`, min: 1, from: p.s.zone ?? "deck" } as Requirement)),
      ],
    }))];

  const avoid = [{ match: "role:Brick", min: 0, max: opts.maxBricks }];
  return {
    first: { name: "Combo off", handSize: 5, lines: starterLines, avoid },
    second: {
      name: "Combo + interaction",
      handSize: 6,
      lines: [
        ...starterLines.map((l) => ({ name: `${l.name} + interaction`, reqs: [...l.reqs, { match: INTERACTION, min: 1 }] })),
        { name: "2+ hand traps / breakers", reqs: [{ match: INTERACTION, min: 2 }] },
      ],
      avoid,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Presets: written by card NAME, resolved to passcodes on import.
//   "card:@Photon Emperor" inside a filter means "that card" (resolved to card:<id>).
// ---------------------------------------------------------------------------------------------
export interface PresetSetup extends Omit<CardSetup, "usedBy"> { usedBy?: "all" | string[] }

export function resolvePreset(p: PresetSetup, idOfName: (n: string) => number | undefined): CardSetup {
  const fix = (f?: string) => f?.replace(/card:@([^+|]+)/g, (_, n) => `card:${idOfName(n.trim()) ?? 0}`);
  const { usedBy, needs, search, cost, routes, ...rest } = p;
  return {
    ...rest,
    routes: routes?.map((r) => ({ ...r, reqs: r.reqs.map((q) => ({ ...q, match: fix(q.match)! })) })),
    needs: needs?.map((r) => ({ ...r, match: fix(r.match)! })),
    search: fix(search), cost: fix(cost),
    usedBy: usedBy === undefined || usedBy === "all" ? usedBy : usedBy.map(idOfName).filter((x): x is number => x !== undefined),
  };
}

const O = "Galaxy Defense Robot Orbital 7", S = "Schwarzschild Infinity Dragon", D = "Photon Delta Wing", SOL = "Galaxy Soldier";
const HT_ = (note: string, keep = false): PresetSetup => ({ roles: ["Hand Trap"], note, keep: keep || undefined });

/**
 * The Galaxy list, built from the two combo guides (anti-Fuwalos/Droll and anti-Nibiru), the card texts,
 * and the deck owner's notes. Tags in notes: [text] card text, [guide] the combo guides, [you] your notes,
 * [inferred] my reading where no guide covered it.
 */
export const GALAXY_PRESET: Record<string, PresetSetup> = {
  [O]: { roles: ["Starter"], note: "1-card starter. Tribute from hand: add Galaxy Wizard/Summoner and Photon Emperor, send Emperor — it revives itself and gives an extra Normal Summon. Comes back when a Galaxy-Eyes is summoned. [text, guide]" },
  [S]: { roles: ["Starter"], note: "1-card starter. Summons itself from hand if you control no monsters, then a Level 8 Dragon from the Deck (Afterglow) → Dragluxion → the Photon Dragon line. Only Seventh Tachyon can search it. [text, guide]" },
  [D]: { roles: ["Starter"], note: "1-card starter: Normal Summon → 2nd Delta Wing from Deck → Galaxy Photon Dragon → add Orbital 7 → Summoner + Emperor → Masquerade Vain → Antimatter → Full Armor → Howling → Photon Orbital → Primal → Dragluxion → Harbinger. [your replay]",
    routes: [{ name: "via Orbital 7 + Summoner (replay)", reqs: [
      { match: "card:@Photon Delta Wing", min: 1, from: "deck" }, { match: "card:@Photon Emperor", min: 1, from: "deck" },
      { match: "card:@Photon Orbital", min: 1, from: "deck" }, { match: `card:@${O}`, min: 1, from: "any" },
      { match: "card:@Galaxy Summoner", min: 1, from: "any" }, { match: "card:@Galaxy-Eyes Tachyon Primal", min: 1, from: "any" },
      { match: "card:@Tachyon Transmigration", min: 1, from: "any" }, { match: "card:@Eternal Galaxy", min: 1, from: "any" } ] }] },
  "Galaxy Wizard": { roles: ["Starter"], search: "name:Galaxy+!name:Galaxy Wizard", note: "Starter that fetches. Normal Summon, tribute: add any Galaxy card — usually Orbital 7 (then the Orbital 7 line). Reused with Galaxy Summoner to fetch Summoner/Primal. [text, guide]" },
  "Seventh Tachyon": { roles: ["Starter"], search: "level:8+race:Dragon|level:8+attr:LIGHT", putBack: true,
    note: "Starter that fetches. Reveal Number 107 from the Extra Deck: add a Level 8 Dragon/LIGHT monster (Orbital 7, or Schwarzschild — the only way to search it), then put a card from hand on top of the Deck, which also gets a drawn Emperor out of your hand. [text, guide]" },
  [SOL]: { roles: ["Starter"], needs: [{ match: "attr:LIGHT", min: 1, from: "hand" }],
    max: 1, note: "Needs another LIGHT monster in hand to discard. Its real job: get a drawn Photon Emperor out of your hand (discard it, it revives itself). The guide plays exactly 1 and doesn't want it as a starter, so the optimiser won't add more. [guide, you]" },
  "Galaxy-Eyes Tachyon Primal": { roles: ["Combo piece", "Extender"], zone: "any", usedBy: "all", brick: true, note: "Summons itself when a Dragon Xyz is on the field, then adds Tachyon Transmigration. Fetched by Dragluxion or Wizard. Brick if drawn. [text, guide]" },
  "Galaxy-Eyes Afterglow Dragon": { roles: ["Combo piece", "Extender"], zone: "any", usedBy: [S], brick: true, note: "Schwarzschild's target. Detached from an Xyz it fetches Galaxy-Eyes Photon Dragon; can summon itself if you control a Galaxy-Eyes. Brick if drawn. [text, guide, you]" },
  "Galaxy-Eyes Photon Dragon": { roles: ["Combo piece"], zone: "any", usedBy: [S], brick: true, note: "Engine requirement, dead in hand. Fetched by Afterglow (and Howling) to make Cipher / Photon Lord. Taking it out of the Deck early stops you drawing it later. [guide, you]" },
  "Photon Emperor": { roles: ["Combo piece"], zone: "deck", usedBy: [O, S, D], brick: true, note: "Must stay in the Deck: Orbital 7 sends it to the GY, it revives itself and grants an extra Normal Summon. Only Soldier or Seventh Tachyon can get it out of your hand. [text, guide, you]" },
  "Galaxy Summoner": { roles: ["Combo piece"], zone: "any", usedBy: "all", brick: true, note: "Added by Orbital 7 / Wizard — not a starter. Normal Summon: revives Orbital 7 / Wizard from the GY and makes Emperor Level 4 → Galaxy Photon Dragon. Brick if drawn. [guide, you]" },
  "Photon Orbital": { roles: ["Combo piece"], zone: "any", usedBy: [S], brick: true, note: "Photon Howling summons it from the Deck; equip it, send it to add Orbital 7 (the Schwarzschild line). Dead in hand without a monster. [text, guide]" },
  "Eternal Galaxy": { roles: ["Combo piece"], zone: "any", usedBy: "all", brick: true, note: "Fetched by Galaxy Photon Dragon, set, then on their turn ranks it up into Photon Lord / Harbinger / Howling. Dead in hand. [guide, you]" },
  "Tachyon Transmigration": { roles: ["Combo piece"], zone: "any", usedBy: "all", brick: true, note: "Fetched by Primal. Counter trap, playable from hand while Tachyon Dragon is on the field — the omni-negate in the end board. Keep it in hand if Nibiru is a risk. [text, guide, you]" },
  "Forbidden Crown": { roles: ["Board Breaker"], note: "Negates a face-up monster for the turn and protects it. Counted as a board breaker. [text, you]" },
  "Pot of Prosperity": { roles: [], note: "Draw engine: banish 3 or 6 Extra Deck cards, add 1 excavated card (modelled as 6). [text]" },
  "Ash Blossom & Joyous Spring": HT_("Hand trap: negates a search, Special Summon from the Deck or send to the GY. One of the 10 the guide plays in every deck. [text, guide]", true),
  "Mulcharmy Fuwalos": HT_("Hand trap if you control no cards: you draw when they summon from the Deck/Extra Deck. 'Number one hand trap' — one of the 10 played in every deck. [text, guide]", true),
  "Ghost Ogre & Snow Rabbit": HT_("Hand trap: destroys a monster/face-up S/T that activates on the field. One of the 10 played in every deck. [text, guide]", true),
  "Droll & Lock Bird": HT_("Hand trap (limited to 1): stops searching for the turn. One of the 10 played in every deck. [text, guide]", true),
  "Dominus Spark": HT_("Flexible slot (guide: cut to 2 if you want). Banishes a monster after they activate in hand/GY; from hand it locks EARTH/WATER/FIRE/WIND monsters (Ash, Fuwalos, Droll) for the Duel. [text, guide]"),
  "Dominus Purge": HT_("Flexible slot. Negates a search; from hand it locks DARK/WATER/FIRE monsters (Schwarzschild, Ash) for the Duel — the guide plays it anyway. [text, guide]"),
  "Infinite Impermanence": HT_("Negates a monster; playable from hand if you control no cards. [text]"),
};

// ---------------------------------------------------------------------------------------------
// Replays → routes
// ---------------------------------------------------------------------------------------------
export interface LearnedForRoute {
  handUsed: number[];
  fromDeck: Map<number, number>;
  searched: Map<number, number>;
  extraUsed: number[];
  endBoard: { code: number }[];
}

/**
 * Turn a learned line into a route for `starter`:
 *  - other opening-hand cards the combo used → must be in hand
 *  - cards taken straight from the Deck (summoned, sent, attached) → must stay in the Deck
 *  - every copy the combo touched → must exist in the 40 (searched cards only need this)
 * `canon` maps a replay passcode to the passcode used in your deck (alt arts).
 */
export function routeFromLearned(l: LearnedForRoute, starter: number, name: string, canon: (c: number) => number): Route {
  const hand = new Map<number, number>(), deck = new Map<number, number>(), total = new Map<number, number>();
  const add = (m: Map<number, number>, c: number, n = 1) => m.set(c, (m.get(c) ?? 0) + n);
  let skippedStarter = false;
  for (const raw of l.handUsed) {
    const c = canon(raw);
    add(total, c);
    if (c === starter && !skippedStarter) { skippedStarter = true; continue; }
    add(hand, c);
  }
  for (const [raw, n] of l.fromDeck) { add(deck, canon(raw), n); add(total, canon(raw), n); }
  for (const [raw, n] of l.searched) add(total, canon(raw), n);

  const reqs: Requirement[] = [];
  for (const [c, n] of hand) reqs.push({ match: `card:${c}`, min: n, from: "hand" });
  for (const [c, n] of deck) reqs.push({ match: `card:${c}`, min: n, from: "deck" });
  // "anywhere in the 40" only adds information beyond the hand/deck requirements when more copies are needed
  for (const [c, n] of total) {
    const covered = (hand.get(c) ?? 0) + (deck.get(c) ?? 0) + (c === starter ? 1 : 0);
    if (n > covered || (!hand.has(c) && !deck.has(c) && c !== starter)) reqs.push({ match: `card:${c}`, min: n, from: "any" });
  }
  return { name, reqs, extra: l.extraUsed.map(canon), endBoard: l.endBoard.map((b) => canon(b.code)) };
}
