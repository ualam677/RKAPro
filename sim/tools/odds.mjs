// Exact odds for a deck list, from engine-verified lines (going 1st: 5 cards, going 2nd: 6 cards).
// Every distinct hand (by card name, hand traps grouped) is enumerated with its exact hypergeometric probability.
// node sim/odds.mjs            -> current deck + variants table
import { pathToFileURL } from "url";
import { MAIN, REPLAY_MAIN } from "../deck.mjs";

// ---- what the engine / replays verified (board ≈ interruptions; lower bounds, the search undercounts) ----
const LIGHT = new Set(["Photon Delta Wing", "Galaxy Defense Robot Orbital 7", "Galaxy Wizard", "Photon Thrasher", "Galaxy War Drake", "Galaxy-Eyes Photon Dragon",
  "Galaxy-Eyes Tachyon Primal", "Galaxy-Eyes Afterglow Dragon", "Photon Emperor", "Photon Orbital", "Galaxy Summoner", "Galaxy Soldier", "Effect Veiler", "Ghost Ogre & Snow Rabbit"]);
// hand traps: live going 1st (on their turn) / going 2nd
const HT1 = new Set(["Nibiru, the Primal Being", "Ash Blossom & Joyous Spring", "Infinite Impermanence", "Effect Veiler", "Ghost Ogre & Snow Rabbit", "Droll & Lock Bird"]);
const HT2 = new Set([...HT1, "Mulcharmy Fuwalos"]);
const LIGHT_HT = new Set(["Effect Veiler", "Ghost Ogre & Snow Rabbit"]);
const L4BODY = ["Galaxy Summoner", "Galaxy War Drake", "Photon Thrasher"]; // Photon/Galaxy bodies Photon Orbital can equip to (Delta/Wizard are starters anyway)

/** Best verified line for a hand (counts by name). Returns { board, nib, light } (light = a LIGHT hand trap is spent as Soldier's cost). */
export function evalHand(h, { prosperityExcavate = 3, remaining } = {}) {
  const n = (x) => h[x] ?? 0;
  const lines = [];
  if (n("Galaxy Defense Robot Orbital 7")) lines.push({ board: 4.25, nib: true });
  if (n("Schwarzschild Infinity Dragon")) lines.push({ board: 4, nib: true });
  if (n("Seventh Tachyon")) lines.push({ board: 4, nib: true });            // reveal N107 -> Infinity Dragon (Schwarz line)
  if (n("Photon Delta Wing")) lines.push({ board: 4, nib: false });
  if (n("Galaxy Wizard")) lines.push({ board: 3.25, nib: true });           // GORB line, no Delta body at the end
  if (n("Galaxy Soldier")) {
    const otherLight = Object.entries(h).some(([k, c]) => LIGHT.has(k) && k !== "Galaxy Soldier" && !LIGHT_HT.has(k) && c > 0);
    if (n("Galaxy Soldier") >= 2 || otherLight) lines.push({ board: 4.25, nib: true });
    else if ([...LIGHT_HT].some((k) => n(k))) lines.push({ board: 4.25, nib: true, light: 1 }); // discards a Veiler/Ogre
  }
  if (n("Photon Orbital") && L4BODY.some((k) => n(k))) lines.push({ board: 4, nib: false });
  if (n("Photon Thrasher") && n("Galaxy War Drake")) lines.push({ board: 3.25, nib: false });
  // Thrasher + any Level 4 -> Galaxy Photon Dragon (engine: 2.25 with Summoner or Fuwalos; 4.25 with Eternal Galaxy too). Lower bounds.
  const thrL4 = n("Photon Thrasher") && (n("Galaxy Summoner") || n("Mulcharmy Fuwalos") || n("Galaxy War Drake"));
  if (thrL4) lines.push({ board: n("Eternal Galaxy") ? 4.25 : 2.25, nib: false });
  const best = (ls) => ls.sort((a, b) => b.board - a.board || (b.nib - a.nib) || ((a.light ?? 0) - (b.light ?? 0)))[0];
  let r = best(lines);
  if (!r && n("Pot of Prosperity") && remaining) { // dig: excavate k, keep 1 that completes the hand
    let ok = 0, D = 0;
    for (const [k, c] of Object.entries(remaining)) { D += c; if (c && evalHand({ ...h, "Pot of Prosperity": 0, [k]: (h[k] ?? 0) + 1 })) ok += c; }
    const kk = prosperityExcavate; let miss = 1; for (let i = 0; i < kk; i++) miss *= (D - ok - i) / (D - i);
    return { board: 4, nib: false, prob: 1 - miss };
  }
  return r ?? null;
}

// ---- exact enumeration ----
const lf = (() => { const c = [0]; for (let i = 1; i < 100; i++) c[i] = c[i - 1] + Math.log(i); return (x) => c[x]; })();
const lc = (n, k) => (k < 0 || k > n ? -Infinity : lf(n) - lf(k) - lf(n - k));
function* enumerate(deck, size) {
  const g = Object.entries(deck).filter(([, k]) => k > 0); const N = g.reduce((a, [, k]) => a + k, 0); const tot = lc(N, size);
  const pick = new Array(g.length).fill(0);
  function* rec(i, left, lp) {
    if (left === 0) { const h = {}; g.forEach(([t], j) => { if (pick[j]) h[t] = pick[j]; }); yield { h, p: Math.exp(lp - tot) }; return; }
    if (i === g.length) return;
    for (let x = Math.min(left, g[i][1]); x >= 0; x--) { pick[i] = x; yield* rec(i + 1, left - x, lp + lc(g[i][1], x)); }
    pick[i] = 0;
  }
  yield* rec(0, size, 0);
}

export function metrics(deck) {
  const N = Object.values(deck).reduce((a, b) => a + b, 0);
  const m = { size: N, full1: 0, nib1: 0, partial1: 0, brick1: 0, full_1ht: 0, full_2ht: 0, full_3ht: 0, eHT1: 0, prosp: 0,
    combo2: 0, ht2_2: 0, ht2_3: 0, combo2_2ht: 0, nibproofShare: 0 };
  for (const { h, p } of enumerate(deck, 5)) {
    const remaining = { ...deck }; for (const [k, c] of Object.entries(h)) remaining[k] -= c;
    const r = evalHand(h, { remaining });
    const q = r?.prob ?? 1;
    const ht = Object.entries(h).reduce((a, [k, c]) => a + (HT1.has(k) ? c : 0), 0) - (r?.light ?? 0);
    if (!r) { m.brick1 += p; continue; }
    if (r.prob !== undefined) m.prosp += p * q;
    m.brick1 += p * (1 - q);
    if (r.board >= 3.25) { m.full1 += p * q; if (r.nib) m.nib1 += p * q; if (ht >= 1) m.full_1ht += p * q; if (ht >= 2) m.full_2ht += p * q; if (ht >= 3) m.full_3ht += p * q; m.eHT1 += p * q * ht; }
    else m.partial1 += p * q;
  }
  for (const { h, p } of enumerate(deck, 6)) {
    const ht = Object.entries(h).reduce((a, [k, c]) => a + (HT2.has(k) ? c : 0), 0);
    const r = evalHand(h); const combo = r && r.board >= 3.25;
    if (combo) m.combo2 += p; if (ht >= 2) m.ht2_2 += p; if (ht >= 3) m.ht2_3 += p; if (combo && ht >= 2) m.combo2_2ht += p;
  }
  return m;
}

const pct = (x) => (100 * x).toFixed(1).padStart(5);
export function table(variants) {
  const rows = [["Variant", "size", "1st:full", "nib-proof", "full+1HT", "full+2HT", "brick", "2nd:≥2HT", "≥3HT", "combo+2HT"]];
  for (const [name, deck] of variants) {
    const m = metrics(deck);
    rows.push([name, m.size, pct(m.full1), pct(m.nib1), pct(m.full_1ht), pct(m.full_2ht), pct(m.brick1), pct(m.ht2_2), pct(m.ht2_3), pct(m.combo2_2ht)]);
  }
  return rows.map((r) => r.map((x, i) => String(x).padEnd(i ? 10 : 34)).join("")).join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) { // file://${argv} never matches on Windows
  const base = { ...MAIN };
  const v = (name, ch) => { const d = { ...base }; for (const [k, x] of Object.entries(ch)) d[k] = (d[k] ?? 0) + x; return [name, d]; };
  console.log(table([
    ["Current 43 (2 Wizard, 2 Transm.)", base],
    ["Old 43 (Thrasher, Prosperity)", REPLAY_MAIN],
    v("1 Wizard, +1 Thrasher", { "Galaxy Wizard": -1, "Photon Thrasher": 1 }),
    v("-1 Transmigration, +Prosperity", { "Tachyon Transmigration": -1, "Pot of Prosperity": 1 }),
    v("42: -1 Transmigration", { "Tachyon Transmigration": -1 }),
    v("42: -War Drake", { "Galaxy War Drake": -1 }),
    v("42: -1 Soldier", { "Galaxy Soldier": -1 }),
    v("42: -1 Fuwalos", { "Mulcharmy Fuwalos": -1 }),
    v("42: -1 Wizard", { "Galaxy Wizard": -1 }),
    v("44: +1 Wizard", { "Galaxy Wizard": 1 }),
    v("44: +1 non-LIGHT hand trap", { "Nibiru, the Primal Being": 1 }),
    v("Fuwalos -1, Droll +1", { "Mulcharmy Fuwalos": -1, "Droll & Lock Bird": 1 }),
    v("-1 Soldier, +1 non-LIGHT HT", { "Galaxy Soldier": -1, "Nibiru, the Primal Being": 1 }),
    v("-1 Seventh, +1 non-LIGHT HT", { "Seventh Tachyon": -1, "Nibiru, the Primal Being": 1 }),
  ]));
}
