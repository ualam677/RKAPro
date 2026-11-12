# Progress log (read this first in every session)

**Current wave:** Waves 0 to 3 are complete. **Next slice:** 2.7 look and feel of the duel screen (user priority), then Wave 4 only when the user says so.

Repo state at last entry: sim/ headless engine and tools work (`scripts/verify.sh` passes all 5 replays); golden tests pass through the library API; app/ is the deck lab (exact stats, quick calculator, deck files, history; 58 tests + `npm run ui-check`); duel client works in the browser (`npm run dev`) and as a desktop app (`npm run desktop`).

## Log (newest first; 3 to 5 lines per slice)
- 12 Nov 2026, user bug: an effect question showed raw placeholders ('of "%ls" from [%ls]?'). Fixed by porting EDOPro's own wording code into `packages/engine/client.mjs` (effect yes/no, location names, zone and card selection titles with their defaults). Test added (29 sim tests).
  User: "can't you just take it from edopro?" Yes for logic, layout numbers and timings (ported, not embedded: EDOPro is C++ on Irrlicht). Its source is now cloned to `sim/data/edopro-src` (git-ignored, AGPL-3.0) as the reference for slice 2.7. Key files: `gframe/duelclient.cpp` (messages to UI), `client_field.cpp` + `drawing.cpp` (field layout, animations), `event_handler.cpp` (clicks, hotkeys), `deck_con.cpp` (deck editor).
- 12 Nov 2026, Wave 3 done (3.1 to 3.5) plus fixes from user feedback on the duel screen. Gates: verify.sh 5/5, 27 sim tests, 58 app tests, ui-check 23 steps (4 runs in a row), desktop-check.
  3.1 Knowledge base: `packs/galaxy-eyes/knowledge/` (README = the format): `lines/*.json` stored lines as ordered summon/activate steps (built from the replays by `node sim/tools/kb-build.mjs`), `roles.json`, `rulings.json`, `cases/`.
  3.2 Drill: Drill tab deals a random hand; ending the turn grades it (`sim/drill.mjs`): board, full board, Nibiru-proof at summon 5 (`packs/galaxy-eyes/drill.mjs`), hand traps kept, steps of the stored line played; verdict better / matched / below. The user's 3 legal recorded lines grade as matched with no deviation (test).
  3.3 Results log: every drill goes to `saves/results.json`; the review shows your full-board, Nibiru-proof and no-board rates next to the exact odds, and hands the model calls a brick but you built from.
  3.4 "That's wrong" button (case with the full position in `knowledge/cases/`), role chips under the card text (`roles.json`), notes (from 2.5).
  3.5 Review asks "why?" only at the first step where you left the stored line; "My line is right: store it" writes `lines/user-<class>.json` and the next drill of that class expects it (confirm box if your board is lower).
  User feedback fixed: level/rank badge on field monsters; the Extra Deck / GY window closes after you act; hand size and shuffle toggle in New duel; EDOPro chain behaviour (asks only when an effect is relevant to the timing; toggles Ignore chains / Always chain); prompt windows moved under the hand.
  New slice 1.7 Deck editor (user: "basic deck maker functionality ignored"): tab with EDOPro's layout (card text, deck, search with type / attribute / level / monster type filters), click to add, right-click for Side, 3-copy and banlist limits, open from and save to EDOPro's deck folder; the lab and the duel use the edited deck.
  Bugs found by the UI check: the drill results file was listed as a save state (Quick load failed); alternate-art passcodes produced duplicate search results.
  Not done: 2.7 look and feel (animations, EDOPro visuals). The deck lab role tags (browser storage) and the knowledge base roles are still two separate stores. Stored user lines do not feed the odds model yet.
- 12 Nov 2026, user feedback on Wave 2: the duel screen works but is badly designed and does not feel like EDOPro (no animations, not snappy). Accepted as a base only. Added slice 2.7 (look and feel) to the roadmap; the user said to go on with Wave 3 first.
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
