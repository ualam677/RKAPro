// node sim/variant.mjs <variant A|B> <comma-separated hand>: best board for that hand under a deck variant
import { beamSolve } from "../beam.mjs";
import { id, mainList, MAIN } from "../deck.mjs";
const [v, handStr, secs = "90", width = "30"] = process.argv.slice(2);
const m = { ...MAIN };
if (v === "B") { m["Galaxy Wizard"] = 2; m["Photon Thrasher"] = 0; }
const names = handStr.split(",");
const hand = names.map(id);
const deck = mainList(m); for (const c of hand) { const i = deck.indexOf(c); if (i < 0) { console.log(JSON.stringify({ v, hand: handStr, err: "not in deck" })); process.exit(); } deck.splice(i, 1); }
const r = beamSolve(hand, deck, { width: Number(width), timeLimitMs: Number(secs) * 1000 });
console.log(JSON.stringify({ v, hand: names.filter((n) => !/Ash|Impermanence/.test(n)).join("+"), board: r.value, parts: r.score?.parts.map((p) => p[0]), monsters: r.board?.monsters, backrow: r.board?.backrow }));
