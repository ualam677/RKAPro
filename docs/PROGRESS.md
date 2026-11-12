# Progress log (read this first in every session)

**Current wave:** 1 (Deck lab). **Next slice:** 1.2 stats panel.

Repo state at last entry: sim/ headless engine and tools work (`scripts/verify.sh` passes all 5 replays); golden tests pass through the library API; app/ ratio optimiser has 48 passing tests; no Electron, no duel UI yet.

## Log (newest first; 3 to 5 lines per slice)
- 12 Nov 2026, slice 1.1 done: `packages/analysis/odds.ts` (pure TypeScript, run directly by Node and bundled by Vite). Hand classes are data: `packs/galaxy-eyes/lines.json` (lines, groups, hand traps, digs).
  `sim/tools/odds.mjs` is now a thin CLI over it; same numbers to the decimal, about 1 s instead of 5 (cards the model cannot tell apart are merged before enumerating).
  New: `node tools/odds.mjs marginals` (per-card -1/+1 table, 2 s). 5 new app tests: parity, sums to 1, merge is lossless, Monte Carlo within 1%.
- 12 Nov 2026, slices 0.3 + 0.4 done (Wave 0 complete): `packages/engine/api.mjs` = `createDuel` -> `options()`, `respond()`, `snapshot()/restore()`, `actionLog()`, plus `replay(log)` and a seeded `shuffled()`.
  A save state is the action log (ordered decks + seed + every response, both players), JSON-safe. One live duel per process (one wasm heap).
  Golden tests: `cd sim && npm test` replays the 5 lines from `packs/galaxy-eyes/golden/*.json` in about 1 s and checks end board, the replay's summon order, determinism and snapshot/restore. Soldier runs in its own process with the Omega ruling.
  Gates for 0.3 and 0.4 were run once, together (0.3 only adds a file).
- 12 Nov 2026, slice 0.2 done: `packages/engine` (core, choices, state, board reading; core has zero imports, the host injects ocgcore + data),
  `packs/galaxy-eyes` (deck.json, board scoring). `sim/engine.mjs` is the Node host; `sim/{choices,state,board,deck}.mjs` are re-export shims, tools unchanged.
  Decisions: the desktop app stays in `app/` (no move to `apps/desktop`, so the gate command stays `cd app && npx vitest run`); `packages/analysis` is created in 1.1 when it has content. Search (beam, follower) stays in `sim/` until Wave 5.
- 12 Nov 2026, slice 0.5 done: `sim/deck.mjs` is the current list; replays keep their recorded list (`REPLAY_MAIN`), `NEWLIST=1` tries them on the current one.
  Current vs old: full 93.3 / 93.5, Nibiru-proof 85.4 / 83.8, full+2HT 41.3 / 41.4, brick 6.7 / 5.9, going-2nd ≥2HT 74.0 / 74.0. Table in NOTES.md.
  Surprise: S38 was Dragluxion's attach target in the Schwarzschild line; Number 62 does that job now (79/79, board 4). Side card 97045738 = Dominus Purge alt art.
  `odds.mjs` never ran on Windows (file:// check); fixed. 0.1 was already done (commit 750e881).
- 12 Nov 2026: user sent the current list; saved to `decks/` (code + decoded diff). `sim/deck.mjs` and all odds still use the old list: slice 0.5 fixes that. Replays still verify on their own lists.
- 12 Nov 2026: planning done (VISION, ARCHITECTURE, DESIGN, ROADMAP, MOBILE). No build slices yet.
