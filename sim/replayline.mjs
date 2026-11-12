import { beamSolve } from "./beam.mjs";
import { id, mainList } from "./deck.mjs";
const guide = ["Photon Delta Wing", "Photon Delta Wing", "Galaxy Photon Dragon", "Galaxy Photon Dragon", "Galaxy Defense Robot Orbital 7", "Photon Emperor", "Galaxy Photon Dragon",
  "Galaxy Summoner", "Galaxy Summoner", "Number 104: Masquerade Vain", "Galaxy-Eyes Antimatter Dragon", "Galaxy-Eyes Antimatter Dragon", "Galaxy Defense Robot Orbital 7",
  "Galaxy-Eyes Full Armor Photon Dragon", "Neo Galaxy-Eyes Photon Dragon - Photon Howling", "Neo Galaxy-Eyes Photon Dragon - Photon Howling", "Photon Orbital", "Photon Orbital",
  "Galaxy-Eyes Tachyon Primal", "Galaxy-Eyes Tachyon Primal", "Divine Golden Shadow Dragon Dragluxion", "Divine Golden Shadow Dragon Dragluxion", "Eternal Galaxy", "Tachyon Transmigration", "Divine Golden Shadow Dragon Dragluxion"];
const names = ["Photon Delta Wing", "Mulcharmy Fuwalos", "Ash Blossom & Joyous Spring", "Effect Veiler", "Infinite Impermanence"];
const hand = names.map(id); const rest = mainList(); for (const c of hand) rest.splice(rest.indexOf(c), 1);
const r = beamSolve(hand, rest, { width: 20, guide });
console.log(`total ${r.value.toFixed(2)} board ${r.score.value} :: ${r.score.parts.map((p) => p[0]).join(" · ")}`);
console.log("board:", r.board.monsters.join(", "), "| backrow:", r.board.backrow.join(", "));
console.log("line:", r.line.filter((l) => /^(Activate|Normal|Special|Set)/.test(l)).join(" → "));
