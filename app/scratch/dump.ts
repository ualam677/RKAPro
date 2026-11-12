import { readFileSync, writeFileSync } from "fs";
import { loadCardDb } from "../src/lib/cards/db";
import { learnLine, parseOmegaReplay } from "../src/lib/replay/omega";
import { canonicalCode, importDeck } from "../src/lib/cards/resolve";
const db = loadCardDb();
const name = (c: number) => db.byId.get(canonicalCode(c, db))?.name ?? `#${c}`;
const out: any[] = [];
for (const f of process.argv.slice(2)) {
  const r = parseOmegaReplay(readFileSync(f, "utf8"));
  const l = learnLine(r, name);
  const deck = importDeck(r.deckCode, db, "x");
  const cnt = (ids: number[]) => { const m = new Map<string, number>(); for (const i of ids) m.set(name(i), (m.get(name(i)) ?? 0) + 1); return Object.fromEntries(m); };
  // our turn-1 events: summons in order (for Nibiru)
  const t1: string[] = []; const guide: string[] = []; const ev: any[] = []; let turn = 0, summons = 0;
  for (const e of r.events) {
    if (e.kind === "turn") { turn = e.turn; continue; }
    if (turn !== 1) continue;
    if (e.player === 0 && e.kind !== "set" && e.kind !== "draw" && e.kind !== "phase" && e.kind !== "win" && (e as any).code) ev.push({ ...e, name: name((e as any).code) });
    if (e.player === 0 && (e.kind === "summon" || e.kind === "activate")) guide.push(name(e.code));
    if (e.kind === "move" && e.player === 0 && e.from === "Deck" && (e.to === "Hand" || e.to === "GY")) guide.push(name(e.code));
    if (e.kind === "summon" && e.player === 0) { summons++; t1.push(`#${summons} ${e.how} ${name(e.code)}`); }
    else if (e.kind === "activate" && e.player === 0) t1.push(`  act ${name(e.code)} (${e.from})`);
    else if (e.kind === "set" && e.player === 0) t1.push(`  set ${name(e.code)}`);
    else if (e.kind === "activate" && e.player === 1) t1.push(`  OPP act ${name(e.code)} (${e.from})`);
  }
  const rec = { file: f, settings: r.settings, main: cnt(deck.deck?.main ?? []), extra: cnt(deck.deck?.extra ?? []), side: cnt(deck.deck?.side ?? []),
    handUsed: l.handUsed.map(name), handUnused: l.handUnused.map(name),
    fromDeck: Object.fromEntries([...l.fromDeck].map(([c, n]) => [name(c), n])), searched: Object.fromEntries([...l.searched].map(([c, n]) => [name(c), n])),
    extraUsed: l.extraUsed.map(name), endBoard: l.endBoard.map((b: any) => ({ ...b, name: name(b.code) })), summons, turn1: t1, guide, events: ev };
  out.push(rec);
}
writeFileSync(new URL("../../replays/learned.json", import.meta.url), JSON.stringify(out, null, 1));
for (const o of out) {
  console.log(`\n===== ${o.file}  hand: ${o.handUsed.join(", ")} | unused: ${o.handUnused.join(", ")}  summons T1: ${o.summons}`);
  console.log("fromDeck:", JSON.stringify(o.fromDeck), "\nsearched:", JSON.stringify(o.searched), "\nextraUsed:", o.extraUsed.join(", "));
  console.log("endBoard:", o.endBoard.map((b: any) => `${b.name}${b.zone ? "@" + b.zone : ""}`).join(", "));
  console.log(o.turn1.join("\n"));
}
console.log("\nDECKS identical:", out.every((o) => JSON.stringify(o.main) === JSON.stringify(out[0].main) && JSON.stringify(o.extra) === JSON.stringify(out[0].extra)));
console.log("main:", JSON.stringify(out[0].main)); console.log("extra:", JSON.stringify(out[0].extra));
for (const o of out.slice(1)) if (JSON.stringify(o.main) !== JSON.stringify(out[0].main) || JSON.stringify(o.extra) !== JSON.stringify(out[0].extra)) console.log("DIFF", o.file, JSON.stringify(o.main), JSON.stringify(o.extra));
