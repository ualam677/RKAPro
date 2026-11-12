// Lightweight model: the user's 5 replays become exact "recipes" (what must be in hand, what must still be in the Deck,
// what gets searched), and the exact hypergeometric engine turns them into odds for any ratio, instantly.
import { readFileSync } from "fs";
import { loadCardDb } from "../src/lib/cards/db";
import { canonicalCode, importDeck } from "../src/lib/cards/resolve";
import { learnLine, parseOmegaReplay } from "../src/lib/replay/omega";
import { evaluate, Goal, Line, Requirement } from "../src/lib/combo/engine";
import { autoSetup, GALAXY_PRESET, INTERACTION, resolvePreset, rolesOf, routeFromLearned, SetupMap } from "../src/lib/combo/setup";
import { DeckEntry } from "../src/lib/combo/types";

const db = loadCardDb();
const canonName = (c: number) => db.byId.get(canonicalCode(c, db))?.name ?? `#${c}`;
const DIR = new URL("../../replays/", import.meta.url).pathname;
const FILES: [string, string, boolean | null][] = [
  ["1-delta.txt", "Delta Wing", false], ["2-orb7-r1.txt", "Orbital 7 (Wizard route)", null],
  ["3-orb7-r2.txt", "Orbital 7 (Thrasher/War Drake route)", null], ["4-soldier.txt", "Galaxy Soldier + LIGHT", true],
  ["5-schwarz.txt", "Schwarzschild", true],
];
const replays = FILES.map(([f]) => parseOmegaReplay(readFileSync(DIR + f, "utf8")));
const { deck } = importDeck(replays[4].deckCode!, db, "x");

// deck entries with roles (hand traps etc.) from the preset / auto setup
const setup: SetupMap = {};
const byNameId = new Map<string, number>();
const counts = new Map<number, number>();
for (const id of deck.main) counts.set(id, (counts.get(id) ?? 0) + 1);
const base: DeckEntry[] = [...counts].map(([id, copies]) => {
  const card = db.byId.get(id)!; byNameId.set(card.name, id);
  const p = GALAXY_PRESET[card.name];
  setup[id] = p ? resolvePreset(p, (n) => byNameId.get(n) ?? [...counts.keys()].find((x) => db.byId.get(x)!.name === n)) : autoSetup(card);
  return { id, card, copies, roles: rolesOf(setup[id]) };
});
const ID = (n: string) => byNameId.get(n)!;
const canon = (c: number) => byNameId.get(canonName(c)) ?? c;

// --- routes from replays ---------------------------------------------------------------
const routes: { name: string; line: Line; nib: boolean | null; ns: boolean }[] = FILES.map(([f, label, nib], i) => {
  const l = learnLine(replays[i], canonName);
  const starter = canon(l.handUsed[0]);
  const r = routeFromLearned(l, starter, label, canon);
  let reqs: Requirement[] = [{ match: `card:${starter}`, min: 1, from: "hand" }, ...r.reqs];
  // Soldier: the other hand card is "any other LIGHT monster" (user: 1.5-card starter)
  if (label.startsWith("Galaxy Soldier")) reqs = [{ match: `card:${starter}`, min: 1, from: "hand" }, { match: "attr:LIGHT", min: 2, from: "hand" }, ...r.reqs.filter((q) => q.from !== "hand")];
  const usesNS = replays[i].events.some((e) => e.kind === "summon" && e.player === 0 && e.how === "Normal");
  return { name: label, line: { name: label, reqs }, nib, ns: usesNS };
});

const describe = (q: Requirement) => `${q.from}:${q.match.startsWith("card:") ? db.byId.get(Number(q.match.slice(5)))?.name : q.match}${q.min > 1 ? " x" + q.min : ""}`;
console.log("\nROUTES (exact recipes from your replays)");
for (const r of routes) console.log(`- ${r.name}${r.nib === true ? " [Nibiru-proof]" : r.nib === false ? " [not Nibiru-proof]" : ""}\n    ${r.line.reqs.map(describe).join(" · ")}`);

// --- evaluation ----------------------------------------------------------------------
const HT: Requirement = { match: INTERACTION, min: 1 };
function stats(entries: DeckEntry[]) {
  const L = routes.map((r) => r.line);
  const mk = (name: string, handSize: number, lines: Line[]): Goal => ({ name, handSize, lines });
  const goals: Goal[] = [
    mk("1st: any verified route", 5, L),
    mk("1st: route + 1 hand trap", 5, L.map((l) => ({ ...l, reqs: [...l.reqs, HT] }))),
    mk("1st: route + 2 hand traps", 5, L.map((l) => ({ ...l, reqs: [...l.reqs, { ...HT, min: 2 }] }))),
    mk("1st: Nibiru-proof route", 5, routes.filter((r) => r.nib).map((r) => r.line)),
    mk("2nd: route (6 cards)", 6, L),
    mk("2nd: route + 2 hand traps", 6, L.map((l) => ({ ...l, reqs: [...l.reqs, { ...HT, min: 2 }] }))),
    mk("2nd: 3+ hand traps", 6, [{ name: "3 HT", reqs: [{ ...HT, min: 3 }] }]),
  ];
  const res = evaluate(entries, goals, undefined, { perLine: true });
  return { goals, res };
}

const t0 = performance.now();
const s0 = stats(base);
console.log(`\nCURRENT 43 (evaluated in ${((performance.now() - t0) / 1000).toFixed(2)}s)`);
s0.goals.forEach((g, i) => console.log(`  ${g.name.padEnd(28)} ${(100 * s0.res[i].p).toFixed(1)}%`));
console.log("  per route, going first (each on its own):");
routes.forEach((r, i) => console.log(`    ${r.name.padEnd(38)} ${(100 * s0.res[0].perLine[i]).toFixed(1)}%`));

// --- variants --------------------------------------------------------------------------
const vary = (changes: Record<string, number>) => base
  .map((e) => ({ ...e, copies: e.copies + (changes[e.card.name] ?? 0) }))
  .filter((e) => e.copies > 0);
const V: [string, Record<string, number>][] = [
  ["43 current", {}],
  ["42: -1 Galaxy Wizard", { "Galaxy Wizard": -1 }],
  ["44: +1 Galaxy Wizard", { "Galaxy Wizard": 1 }],
  ["42: -1 Galaxy Soldier", { "Galaxy Soldier": -1 }],
  ["42: -1 Photon Delta Wing", { "Photon Delta Wing": -1 }],
  ["42: -1 Seventh Tachyon", { "Seventh Tachyon": -1 }],
  ["42: -1 Pot of Prosperity", { "Pot of Prosperity": -1 }],
  ["41: -Thrasher -War Drake", { "Photon Thrasher": -1, "Galaxy War Drake": -1 }],
  ["42: -1 Effect Veiler", { "Effect Veiler": -1 }],
  ["42: -1 Mulcharmy Fuwalos", { "Mulcharmy Fuwalos": -1 }],
  ["42: -1 Droll & Lock Bird", { "Droll & Lock Bird": -1 }],
  ["41: -1 Veiler -1 Fuwalos", { "Effect Veiler": -1, "Mulcharmy Fuwalos": -1 }],
  ["40: -1 Veiler -1 Fuwalos -1 Droll", { "Effect Veiler": -1, "Mulcharmy Fuwalos": -1, "Droll & Lock Bird": -1 }],
];
console.log("\nVARIANTS (verified routes only)          1st:route  +1HT   +2HT   NibProof | 2nd:route +2HT  3+HT");
for (const [name, ch] of V) {
  const e = vary(ch); const n = e.reduce((a, x) => a + x.copies, 0);
  const { res } = stats(e);
  const f = (i: number) => (100 * res[i].p).toFixed(1).padStart(5);
  console.log(`  ${name.padEnd(38)} ${f(0)}  ${f(1)}  ${f(2)}  ${f(3)}   | ${f(4)}  ${f(5)}  ${f(6)}   (${n} cards)`);
}
console.log(`\ntotal ${((performance.now() - t0) / 1000).toFixed(1)}s`);

// --- sensitivity: card text says these also work from the hand ------------------------------------
const FROM_HAND_OK = ["Photon Orbital", "Galaxy War Drake", "Galaxy-Eyes Photon Dragon"].map(ID);
const relax = (l: Line): Line => ({ ...l, reqs: l.reqs.map((q) => (q.from === "deck" && FROM_HAND_OK.includes(Number(q.match.slice(5))) ? { ...q, from: "any" as const } : q)) });
const unverified = ["Seventh Tachyon", "Pot of Prosperity", "Galaxy Wizard", "Photon Thrasher"].map((n) => ({ name: n, reqs: [{ match: `card:${ID(n)}`, min: 1, from: "hand" as const }] }));
const strict = routes.map((r) => r.line), relaxed = strict.map(relax);
const ev = (lines: Line[], n = 5) => evaluate(base, [{ name: "x", handSize: n, lines }], undefined, { perLine: true })[0];
const rs = ev(strict), rr = ev(relaxed), ru = ev([...relaxed, ...unverified]);
console.log("\nSENSITIVITY (going first)");
console.log(`  strict recipes (1-ofs must stay in Deck)        ${(100 * rs.p).toFixed(1)}%`);
console.log(`  Photon Orbital / War Drake / GEPD ok from hand  ${(100 * rr.p).toFixed(1)}%`);
routes.forEach((r, i) => console.log(`      ${r.name.padEnd(38)} ${(100 * rs.perLine[i]).toFixed(1)}% -> ${(100 * rr.perLine[i]).toFixed(1)}%`));
console.log(`  + hands whose only starter is 7th/Prosperity/Wizard/Thrasher (no replay yet): ${(100 * (ru.p - rr.p)).toFixed(1)}% more`);
// which opened 1-ofs most often "break" a route in the strict model
for (const n of ["Photon Emperor", "Photon Orbital", "Galaxy War Drake", "Galaxy-Eyes Afterglow Dragon", "Galaxy-Eyes Photon Dragon"]) {
  const loose = (l: Line): Line => ({ ...l, reqs: l.reqs.map((q) => (q.from === "deck" && q.match === `card:${ID(n)}` ? { ...q, from: "any" as const } : q)) });
  console.log(`  if ${n.padEnd(30)} in hand is fine: ${(100 * ev(strict.map(loose)).p).toFixed(1)}%`);
}
