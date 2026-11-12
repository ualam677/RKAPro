// node tools/kb-build.mjs   Build the pack's stored lines from the user's replays (replays/learned.json) and seed
// roles.json / rulings.json if they do not exist. Never touches lines you promoted yourself ("source": "user") or cases.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const root = fileURLToPath(new URL("../..", import.meta.url));
const pack = path.join(root, "packs/galaxy-eyes"), kb = path.join(pack, "knowledge");
const L = JSON.parse(readFileSync(path.join(root, "replays/learned.json"), "utf8"));
const model = JSON.parse(readFileSync(path.join(pack, "lines.json"), "utf8"));
const golden = (i) => JSON.parse(readFileSync(path.join(pack, `golden/${i}.json`), "utf8"));
const cls = (name) => { const l = model.lines.find((x) => x.name === name); if (!l) throw new Error("no hand class " + name); return l; };
const stepsOf = (R) => R.events.filter((e) => e.player === 0 && (e.kind === "summon" || e.kind === "activate")).map((e) => ({ k: e.kind, name: e.name }));

// replay route -> the hand class it plays. Route 2 (Orbital 7 via Photon Thrasher) is not in the current list.
const MAP = [
  { route: 0, id: "delta-wing", class: "Delta Wing" },
  { route: 1, id: "orbital-7", class: "Orbital 7" },
  { route: 4, id: "infinity-dragon", class: "Infinity Dragon" },
  { route: 4, id: "seventh-tachyon", class: "Seventh Tachyon", prefix: [{ k: "activate", name: "Seventh Tachyon" }], note: "Seventh Tachyon reveals Number 107 and adds Infinity Dragon, then the Infinity Dragon line. The prefix is not from a replay." },
  { route: 3, id: "soldier-light-hand-trap", class: "Soldier + LIGHT hand trap", legal: false, note: "Recorded in YGO Omega; it uses Galaxy-Eyes Antimatter Dragon's detach effect on turn 1, which EDOPro does not allow. Shown for reference, never expected." },
];
mkdirSync(path.join(kb, "lines"), { recursive: true }); mkdirSync(path.join(kb, "cases"), { recursive: true });
for (const m of MAP) {
  const R = L[m.route], c = cls(m.class), g = golden(m.route);
  const line = { id: m.id, class: m.class, source: `replay ${R.file.split("/").pop()}`, legal: m.legal !== false, board: g.expect.board, nib: c.nib,
    ...(m.note ? { note: m.note } : {}), steps: [...(m.prefix ?? []), ...stepsOf(R)], endBoard: { monsters: g.expect.monsters, backrow: g.expect.backrow } };
  writeFileSync(path.join(kb, "lines", `${m.id}.json`), JSON.stringify(line, null, 1) + "\n");
  console.log(`${m.id}: ${line.steps.length} steps, board ${line.board}, Nibiru-proof ${line.nib}${line.legal ? "" : " (not legal in EDOPro)"}`);
}
const seed = (file, value) => { const p = path.join(kb, file); if (!existsSync(p)) { writeFileSync(p, JSON.stringify(value, null, 1) + "\n"); console.log("seeded " + file); } };
const starters = model.lines.filter((l) => l.needs.length === 1 && (l.needs[0].min ?? 1) === 1 && l.needs[0].any).flatMap((l) => l.needs[0].any);
seed("roles.json", Object.fromEntries([...starters.map((n) => [n, ["Starter"]]), ["Galaxy Soldier", ["Starter"]], ...model.handTrapsSecond.map((n) => [n, ["Hand Trap"]])]));
seed("rulings.json", [{ card: "Galaxy-Eyes Antimatter Dragon", edopro: "The detach effect needs a possible Battle Phase, so it cannot be used on turn 1.", omega: "Allowed on turn 1.", authority: "EDOPro", note: "The Soldier replay only reproduces with YGO_OMEGA_RULINGS=1." }]);
