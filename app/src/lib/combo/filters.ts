import { Card, isMonster, TYPE } from "../cards/db";

/**
 * A filter is a short string so it's easy to store, share and show:
 *   card:14558127   a specific card
 *   role:Starter    a role you tagged
 *   attr:LIGHT      a monster of that Attribute
 *   race:Dragon     a monster of that Type
 *   level:8         a monster of that Level
 *   kind:monster | kind:spell | kind:trap
 *   tuner
 *   name:Galaxy     card name contains the word ("Galaxy" also covers "Galaxy-Eyes")
 *   any             any card (e.g. discard fodder)
 * "+" = ALL of them on the same card ("attr:LIGHT+level:8" = a Level 8 LIGHT monster).
 * "!" in front of a part = NOT it ("name:Galaxy+!name:Galaxy Wizard").
 * "|" = either side ("level:8+race:Dragon|level:8+attr:LIGHT"); it binds loosest.
 */
export type Filter = string;

export interface DeckEntry {
  id: number;
  card: Card;
  copies: number;
  roles: string[];
}

const split = (p: string): [string, string] => {
  const i = p.indexOf(":"); // names can contain ":" ("Number 107: ..."), so split on the FIRST colon only
  return i < 0 ? [p, ""] : [p.slice(0, i), p.slice(i + 1)];
};

function matchOne(e: DeckEntry, part: string): boolean {
  const neg = part.startsWith("!");
  const [k, v] = split(neg ? part.slice(1) : part);
  const c = e.card;
  let r: boolean;
  switch (k) {
    case "any": r = true; break;
    case "card": r = e.id === Number(v); break;
    case "role": r = e.roles.includes(v); break;
    case "attr": r = isMonster(c) && c.attribute === v; break;
    case "race": r = isMonster(c) && c.race === v; break;
    case "level": r = isMonster(c) && c.level === Number(v); break;
    case "kind": r = v === "monster" ? isMonster(c) : c.kind === v; break;
    case "tuner": r = (c.type & TYPE.TUNER) !== 0; break;
    case "name": r = c.name.toLowerCase().includes(v.toLowerCase()); break;
    default: r = false;
  }
  return neg ? !r : r;
}

export const matches = (e: DeckEntry, f: Filter) =>
  f.split("|").some((alt) => alt.split("+").every((p) => matchOne(e, p.trim())));

/** Human label for a filter. */
export function describe(f: Filter, nameOf: (id: number) => string): string {
  return f.split("|").map((alt) => describeAll(alt, nameOf)).join(" or ");
}

function label([k, v]: [string, string], nameOf: (id: number) => string): string {
  switch (k) {
    case "any": return "any card";
    case "card": return nameOf(Number(v));
    case "role": return v;
    case "attr": return `${v} monster`;
    case "race": return `${v} monster`;
    case "level": return `Level ${v} monster`;
    case "kind": return v[0].toUpperCase() + v.slice(1);
    case "tuner": return "Tuner";
    case "name": return `"${v}" card`;
    default: return k;
  }
}

function describeAll(f: Filter, nameOf: (id: number) => string): string {
  const parts = f.split("+").map((p) => p.trim()).map((p) => ({ neg: p.startsWith("!"), kv: split(p.startsWith("!") ? p.slice(1) : p) }));
  const pos = parts.filter((p) => !p.neg).map((p) => p.kv);
  const neg = parts.filter((p) => p.neg).map((p) => p.kv);
  const except = neg.map((n) => ` except ${label(n, nameOf)}`).join("");

  // Monster properties read naturally together: "Level 8 LIGHT Dragon monster"
  if (pos.length > 1 && pos.every(([k]) => k === "attr" || k === "level" || k === "race")) {
    const get = (k: string) => pos.find(([x]) => x === k)?.[1];
    return [get("level") && `Level ${get("level")}`, get("attr"), get("race"), "monster"].filter(Boolean).join(" ") + except;
  }
  // "name:Galaxy + kind:monster" -> '"Galaxy" monster'
  const name = pos.find(([k]) => k === "name"), kind = pos.find(([k]) => k === "kind");
  if (name && kind) {
    const rest = pos.filter((p) => p !== name && p !== kind);
    return [`"${name[1]}" ${kind[1]}`, ...rest.map((r) => label(r, nameOf))].join(" & ") + except;
  }
  return pos.map((p) => label(p, nameOf)).join(" & ") + except;
}
