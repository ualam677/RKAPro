import { hands, classOf } from "./classes.mjs";
import { MAIN } from "../deck.mjs";
for (const n of [5, 6]) {
  const cls = new Map(); let tot = 0;
  for (const h of hands(MAIN, n)) { tot += h.p; const c = classOf(h.counts); cls.set(c.key, (cls.get(c.key) ?? 0) + h.p); }
  const arr = [...cls.values()].sort((a, b) => b - a);
  let acc = 0; const marks = [0.5, 0.8, 0.9, 0.95, 0.98, 0.99]; const out = [];
  arr.forEach((p, i) => { const before = acc; acc += p; for (const m of marks) if (before < m && acc >= m) out.push(`${m * 100}%:${i + 1}`); });
  const noEngine = [...cls].filter(([k]) => !k.split(" + ").some((x) => !["Effect Veiler", "Ash Blossom & Joyous Spring", "Infinite Impermanence"].includes(x))).reduce((a, [, p]) => a + p, 0);
  console.log(`${n} cards: total p=${tot.toFixed(6)} classes=${cls.size}  ${out.join(" ")}  no-engine=${(noEngine * 100).toFixed(2)}%`);
}
