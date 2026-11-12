// Exact odds for the current deck + variants (CLI).  node tools/odds.mjs [marginals]
import { pathToFileURL } from "url";
import { MAIN, REPLAY_MAIN } from "../deck.mjs";

import model from "../../packs/galaxy-eyes/lines.json" with { type: "json" };
import * as A from "../../packages/analysis/odds.ts"; // the model lives in packages/analysis; this file is the CLI
export const evalHand = (h, { remaining } = {}) => A.evalHand(model, h, remaining);
export const metrics = (deck) => A.metrics(model, deck);

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
  if (process.argv[2] === "marginals") {
    const { base: b0, rows } = A.marginals(model, base);
    const d = (x, k) => (x ? ((x[k] - b0[k]) * 100).toFixed(1).padStart(5) : "    .");
    console.log(["Card (-1 / +1 copy, change in %)".padEnd(34), ...A.METRIC_KEYS.map((k) => A.METRIC_LABELS[k].padEnd(16))].join(""));
    for (const r of rows) console.log(`${r.copies}x ${r.name}`.padEnd(34) + A.METRIC_KEYS.map((k) => `${d(r.minus, k)} /${d(r.plus, k)}`.padEnd(16)).join(""));
  } else console.log(table([
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
