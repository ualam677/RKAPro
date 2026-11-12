import { lib, newDuel, runUntilPrompt, nameOf, errors } from "./engine.mjs";
import { id, mainList, extraList } from "./deck.mjs";
const hand = ["Photon Delta Wing", "Mulcharmy Fuwalos", "Ash Blossom & Joyous Spring", "Effect Veiler", "Infinite Impermanence"].map(id);
const rest = mainList(); for (const h of hand) rest.splice(rest.indexOf(h), 1);
const filler = Array(40).fill(id("Dark Magician"));
let t = performance.now();
const h = newDuel({ deck0: [...hand, ...rest], extra0: extraList(), deck1: filler });
const { prompt, log } = runUntilPrompt(h);
console.log("ms to first prompt", (performance.now() - t).toFixed(1));
console.log("prompt type", prompt.type, "player", prompt.player);
console.log("summons", prompt.summons?.map((c) => nameOf(c.code)), "activates", prompt.activates?.map((c) => nameOf(c.code)), "spsummons", prompt.special_summons?.map((c) => nameOf(c.code)));
console.log("errors", errors.slice(0, 5));
t = performance.now();
for (let i = 0; i < 20; i++) { const h2 = newDuel({ deck0: [...hand, ...rest], extra0: extraList(), deck1: filler }); runUntilPrompt(h2); lib.destroyDuel(h2); }
console.log("avg ms per fresh duel to first prompt", ((performance.now() - t) / 20).toFixed(1));
