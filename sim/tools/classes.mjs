// Hand classes: opening hands grouped by what matters to the engine.
// Hand traps are never used on your own turn, so they only matter as discard fodder:
//   L = LIGHT monster hand trap (Veiler, Ghost Ogre) - Galaxy Soldier can discard it
//   M = other monster hand trap (Ash, Fuwalos, Droll)
//   S = non-monster hand trap (Infinite Impermanence)
// A class is solved once with a representative hand; its probability under any deck comes from the hypergeometric.
export const HT_CLASS = {
  "Effect Veiler": "L", "Ghost Ogre & Snow Rabbit": "L",
  "Ash Blossom & Joyous Spring": "M", "Mulcharmy Fuwalos": "M", "Droll & Lock Bird": "M", "Nibiru, the Primal Being": "M",
  "Infinite Impermanence": "S",
};
export const REP = { L: "Effect Veiler", M: "Ash Blossom & Joyous Spring", S: "Infinite Impermanence" };
export const CAP = { L: 2, M: 1, S: 1 };

const lgamma = (() => { const c = [0]; for (let i = 1; i < 200; i++) c[i] = c[i - 1] + Math.log(i); return (n) => c[n]; })();
const lchoose = (n, k) => (k < 0 || k > n ? -Infinity : lgamma(n) - lgamma(k) - lgamma(n - k));

/** Group a deck (name -> count) into types: engine names, plus L/M/S buckets. */
export function groups(deck) {
  const g = new Map();
  for (const [n, k] of Object.entries(deck)) { if (!k) continue; const key = HT_CLASS[n] ?? n; g.set(key, (g.get(key) ?? 0) + k); }
  return g;
}

/** Every distinct hand (as type counts) of size n, with its exact probability. */
export function* hands(deck, n) {
  const g = [...groups(deck)]; const N = g.reduce((a, [, k]) => a + k, 0);
  const total = lchoose(N, n);
  const pick = new Array(g.length).fill(0);
  function* rec(i, left, lp) {
    if (left === 0) { yield { counts: Object.fromEntries(g.map(([t], j) => [t, pick[j]]).filter(([, x]) => x)), p: Math.exp(lp - total) }; return; }
    if (i === g.length) return;
    for (let x = Math.min(left, g[i][1]); x >= 0; x--) { pick[i] = x; yield* rec(i + 1, left - x, lp + lchoose(g[i][1], x)); }
    pick[i] = 0;
  }
  yield* rec(0, n, 0);
}

/** Key of the representative hand that gets solved for these counts. Excess hand traps are simply kept. */
export function classOf(counts) {
  const eng = []; let L = 0, M = 0, S = 0;
  for (const [t, x] of Object.entries(counts)) { if (t === "L") L = x; else if (t === "M") M = x; else if (t === "S") S = x; else for (let i = 0; i < x; i++) eng.push(t); }
  eng.sort();
  const c = { L: Math.min(L, CAP.L), M: Math.min(M, CAP.M), S: Math.min(S, CAP.S) };
  const spare = L - c.L + M - c.M + S - c.S;
  const names = [...eng, ...Array(c.L).fill(REP.L), ...Array(c.M).fill(REP.M), ...Array(c.S).fill(REP.S)];
  return { key: names.join(" + "), names, engine: eng, spare, ht: L + M + S };
}
