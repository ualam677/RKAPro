// node sim/hands.mjs <tests.json> <from> <to>: best board (beam search, optionally guided by a replay) for test hands.
// Each test: { name, cards: [...engine cards], guide: routeIndex|null }. Hands are padded with Ash/Imperm (not LIGHT, never used on our turn).
import { readFileSync } from "fs";
import { beamSolve } from "../beam.mjs";
import { id, mainList } from "../deck.mjs";
const L = JSON.parse(readFileSync(new URL("../../replays/learned.json", import.meta.url), "utf8"));
const [file, from = "0", to = "999", secs = "75", width = "30"] = process.argv.slice(2);
const tests = JSON.parse(readFileSync(file, "utf8")).slice(Number(from), Number(to));
const FILL = ["Ash Blossom & Joyous Spring", "Infinite Impermanence", "Ash Blossom & Joyous Spring", "Infinite Impermanence", "Ash Blossom & Joyous Spring"];
for (const t of tests) {
  const names = [...t.cards, ...FILL].slice(0, 5);
  const hand = names.map(id); const deck = mainList(); for (const c of hand) deck.splice(deck.indexOf(c), 1);
  const r = beamSolve(hand, deck, { width: Number(width), guide: t.guide != null ? L[t.guide].guide : undefined, timeLimitMs: Number(secs) * 1000 });
  console.log(JSON.stringify({ name: t.name, board: r.score?.value ?? 0, parts: r.score?.parts.map((p) => p[0]) ?? [], monsters: r.board?.monsters, backrow: r.board?.backrow, secs: +((r.ms ?? 0) / 1000).toFixed(0) }));
}
