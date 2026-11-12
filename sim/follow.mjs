// Play a scripted line: at each of our prompts pick the first option matching the next script regex.
import { lib, newDuel, runUntilPrompt, nameOf } from "./engine.mjs";
import { choices } from "./choices.mjs";
import { readSide, scoreBoard, describeBoard } from "./board.mjs";
import { id, mainList, extraList } from "./deck.mjs";
export function follow(handNames, script, { verbose = true } = {}) {
  const hand = handNames.map(id); const rest = mainList(); for (const c of hand) rest.splice(rest.indexOf(c), 1);
  const h = newDuel({ deck0: [...hand, ...rest], extra0: extraList(), deck1: Array(40).fill(id("Dark Magician")) });
  let i = 0;
  for (let g = 0; g < 500; g++) {
    const log = [];
    const r = runUntilPrompt(h, log);
    if (r.ended || log.some((m) => m.type === 40 && m.player === 1)) break;
    const p = r.prompt; const c = choices(p);
    if (p.player !== 0) { lib.duelSetResponse(h, (c.find((x) => x.pass) ?? c[0]).res); continue; }
    let pick = null;
    for (let k = i; k < Math.min(script.length, i + 1) && !pick; k++) { pick = c.find((x) => script[k].test(x.label)); if (pick) i = k + 1; }
    if (!pick) {
      if (p.type === 11 && i < script.length) { console.log("LOST at idle, expected", script[i], "options:", c.map((x) => x.label).join(" | ")); break; }
      pick = c.find((x) => x.pass) ?? (i >= script.length ? c.find((x) => x.end) : null) ?? c.find((x) => /^No/.test(x.label)) ?? c[0];
    }
    if (verbose && c.length > 1) console.log(`${pick === c.find((x) => i > 0 && script[i - 1]?.test(x.label)) ? "✔" : " "} [${c.map((x) => x.label).slice(0, 8).join(" | ")}${c.length > 8 ? " …" : ""}]  → ${pick.label}`);
    lib.duelSetResponse(h, pick.res);
  }
  const s = readSide(h, 0); const sc = scoreBoard(s);
  console.log(`script used ${i}/${script.length}; board ${sc.value} ::`, sc.parts.map((p) => p[0]).join(" · "), "| hand traps", sc.handTraps);
  console.log("board:", JSON.stringify(describeBoard(s)));
  lib.destroyDuel(h);
}
const R = (s) => new RegExp(s);
export const DELTA_LINE = [
  R("^Normal Summon Photon Delta Wing"), R("^Yes: Photon Delta Wing"),
  R("^Special Summon Galaxy Photon Dragon"),
  R("^Activate Galaxy Photon Dragon"), R("^Pick Galaxy Defense Robot Orbital 7"), R("^Option 0"),
  R("^Activate Galaxy Defense Robot Orbital 7"), R("^Select Photon Emperor"), R("^Select Galaxy Summoner"), R("^Pick Galaxy Summoner"),
  R("Yes: Photon Emperor"), R("Yes: Galaxy Photon Dragon"),
  R("^Normal Summon Galaxy Summoner"), R("Galaxy Summoner"), R("Pick Photon Delta Wing"),
  R("^Special Summon Number 104"),
  R("^Special Summon Galaxy-Eyes Antimatter"), R("^Chain Galaxy Defense Robot Orbital 7|^Yes: Galaxy Defense Robot Orbital 7"),
  R("^Special Summon Galaxy-Eyes Full Armor"),
  R("^Special Summon Neo Galaxy-Eyes Photon Dragon - Photon Howling"), R("Photon Howling"), R("Pick Photon Orbital"), R("Option"),
  R("^Activate Photon Orbital"), R("Pick"), R("^Activate Photon Orbital"), R("Pick Galaxy-Eyes Tachyon Primal"),
  R("^Activate Galaxy-Eyes Tachyon Primal"), R("^Option 0"), R("Pick Tachyon Transmigration"),
  R("^Special Summon Divine Golden Shadow Dragon Dragluxion"), R("Dragluxion"), R("Pick Eternal Galaxy"),
  R("^Set Eternal Galaxy"), R("^Set Tachyon Transmigration"),
  R("^Activate Divine Golden Shadow Dragon Dragluxion"), R("Number 38"),
];
if (process.argv[1].endsWith("follow.mjs")) follow(["Photon Delta Wing", "Mulcharmy Fuwalos", "Ash Blossom & Joyous Spring", "Effect Veiler", "Infinite Impermanence"], DELTA_LINE);
