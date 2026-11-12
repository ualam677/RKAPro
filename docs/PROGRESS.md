# Progress log (read this first in every session)

**Current wave:** 3 (Drill mode, knowledge base, feedback). **Next slice:** 3.1 knowledge base format.

Repo state at last entry: sim/ headless engine and tools work (`scripts/verify.sh` passes all 5 replays); golden tests pass through the library API; app/ is the deck lab (exact stats, quick calculator, deck files, history; 58 tests + `npm run ui-check`); duel client works in the browser (`npm run dev`) and as a desktop app (`npm run desktop`).

## Log (newest first; 3 to 5 lines per slice)
- 12 Nov 2026, Wave 2 done (slices 2.1 to 2.6, built together and committed as one because they share the same files; gates run once at the end). User direction: an EDOPro clone with the ratio tools as a tab.
  2.1 Shell + board: `app/electron/main.mjs` (engine in-process, `npm run desktop`), `app/src/duel/` (EDOPro layout: card detail + chat left, playmat in perspective, piles, Xyz material badges). Pictures, card back and system strings come from the user's EDOPro install (`C:ProjectIgnis`), missing pictures from EDOPro's picture host into `sim/data/pics`.
  2.2 Prompts: `packages/engine/client.mjs` maps every engine prompt to a screen model and clicks back to responses (full fidelity: zones, positions, chains). Trivial prompts are answered automatically; toggles Auto-place and Ignore chains. Keys: Esc/right-click cancel, Enter confirm, U or Ctrl+Z undo, S save, L load, N new hand, B battle, E end. No animations.
  2.3 Goldfish: `packages/engine/session.mjs` + `sim/server.mjs` (HTTP on localhost; Vite dev starts it). New duel from the pack list, the deck lab deck or an EDOPro .ydk; opening hand random or chosen. Opponent = 40 fillers that always pass.
  2.4 Save states: the action log replayed (no heap snapshots needed: about 0.1 s). Undo, restart hand, quick save/load, named saves with parent links (branch tree) as JSON files in `saves/`.
  2.5 Chat: turns, phases, moves, summons with a per-turn count, chains, Nibiru note at summon 5, hand-trap windows (Ash, Droll, Veiler/Imperm/Ogre) worked out from what each effect did, user notes kept in the save.
  2.6 EDOPro: deck folder listed in New duel; pictures, textures, strings used. Card database: still the pinned `sim/data` (the gate vouches for it); `YGO_CDB_DIR` / `YGO_SCRIPTS_DIR` point it at EDOPro's.
  Tests: 22 sim tests (random player over 6 seeds: every offered click is legal, undo and save/load exact; all 5 recorded lines played click by click end on the recorded boards), `npm run ui-check` 16 steps, `node scripts/desktop-check.mjs` (real Electron window).
  Surprises: `ELECTRON_RUN_AS_NODE=1` is set inside VS Code and turns Electron into plain Node (launcher `scripts/desktop.mjs` clears it); never `await app.whenReady()` at the top level of an ESM main (deadlock); npm blocks install scripts here, so Electron's binary needs `node node_modules/electron/install.js` (now in setup.sh).
- 12 Nov 2026, slice 1.6 done (Wave 1 complete): `node sim/tools/update-data.mjs` pulls BabelCDB + CardScripts, reports new/changed cards and scripts (deck cards called out), runs golden tests + verify.sh, pins the commits in `sim/data.lock.json` on green and rolls back on red. `--check` only reports. `scripts/setup.sh` now checks out the pin.
  Run for real: already up to date; then stepped the data back 2 commits and updated again (1 script changed, no deck card, gate green, pin written).
  Not exercised: the rollback branch (needs an update that breaks a replay).
- 12 Nov 2026, slice 1.5 done: deck version history (`app/src/lib/history.ts`, `History.tsx`). Every Main Deck edit becomes a version (1.2 s debounce) with 5 numbers and the change against the version before; Restore brings a version back; capped at 200.
  Stored in localStorage (`rkapro-history-v1`), so it is per browser profile for now; a file on disk comes with the Electron shell if needed.
  3 unit tests; UI check covers edit, change in odds and restore.
- 12 Nov 2026, slice 1.4 done: panel "Deck files" (`DeckFiles.tsx`): download .ydk, copy ydke:// and Omega code; deck folders through the File System Access API (pick EDOPro deck folders or a Drive-synced folder; lists .ydk, click to import, save current deck there). Folder handles persist in IndexedDB.
  No server needed. Works in Edge, Chrome and Electron, not Firefox or Safari. The native folder dialog cannot be driven headless, so the UI check uses the browser's private file system as the folder (save, list, re-import verified).
  Not checked: a real EDOPro folder and a real Drive-synced folder on this machine.
- 12 Nov 2026, slice 1.3 done: quick calculator (`packages/analysis/quick.ts`, panel `QuickCalc.tsx`): starters, hand traps, bricks, 2-card pairs, open-with min/max rules, for 5 and 6 cards, any deck.
  New tile flag "Needs Normal Summon": all such starters together count as one play ("2 plays" row). Role tags are remembered per card name (localStorage `rkapro-roles-v1`) and reused on the next import.
  3 closed-form tests; UI check covers pair, rule, flag and memory. Not built: non-OPT flag, deck-size sweep (not in the slice text).
- 12 Nov 2026, slice 1.2 done: app panel "Exact stats" (`app/src/components/ExactStats.tsx`): 10 separate numbers, change vs the list as imported, which line each hand plays, per-card -1/+1 table. Button "Load my current list" reads the pack.
  UI check: `cd app && npm run dev`, then `npm run ui-check` (headless Edge through playwright-core, no browser download); it asserts the numbers on screen and writes screenshots.
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
