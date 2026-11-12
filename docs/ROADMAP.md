# RKAPro roadmap: build in waves

Ordered most important to least. Each wave ships something usable and leaves the repo green, so it is safe to stop between any two waves, or between any two slices inside one. **Waves 0 to 3 are the minimum useful product** (calculator, playable client with save states, drill mode). Everything after that is a bonus.

Current wave and next step: see `docs/PROGRESS.md`.

## Session protocol (keeps usage low)
1. Start by reading only `CLAUDE.md`, this file's current wave, and `docs/PROGRESS.md`. Do not read the whole docs folder.
2. Work one **slice** at a time (a checkbox below). One slice is about one context window. Name the exact files in the prompt.
3. Finish a slice: run its gate (`scripts/verify.sh` for engine work, `cd app && npx vitest run` for app work), commit, and add 3 to 5 lines to `docs/PROGRESS.md` (done, next slice, anything surprising).
4. Usage running low mid-slice: commit work in progress on a branch (`wip/<slice>`), write the next step into `PROGRESS.md`, stop. Never leave `main` red.
5. `/clear` between slices. Use a cheaper model for plumbing, UI and porting; use the strongest model for design-heavy slices (marked **design**).
6. Corrections from the user go into `docs/KNOWLEDGE.md` immediately.

## Constraints from day one (cheap now, expensive to retrofit)
- `packages/engine` has **no Node-only imports**; card data and scripts come through an injected loader. This is what lets the same engine run in Electron, a worker, and a phone.
- The UI is **responsive React** and talks to the engine through one interface (worker or in-process).
- Save states are stored as **seed plus response log** (deterministic replay), with heap snapshots only as an in-memory speed cache. Small, portable, shareable.
- Everything deck-specific lives in a **pack** (`packs/<deck>`): roles, lines, board scoring, hand classes. Core code never names a Galaxy-Eyes card.
- Search output is data (lines, scores) that can be computed on desktop and read elsewhere.

## Wave 0: Foundation (small)
Why first: every later wave depends on it, and it protects the verified work.
- [x] 0.1 Install `.claude/` skills and agent from `docs/claude-code-setup/`, then delete "Engine facts and gotchas" from `CLAUDE.md`.
- [x] 0.2 Workspace layout: `packages/engine`, `packages/analysis`, `packs/galaxy-eyes`, `apps/desktop`; `sim/tools` keeps working through re-exports. **design**
- [x] 0.3 Engine API: `createDuel`, `legalOptions`, `respond`, `snapshot/restore`, `actionLog` (seed + responses), deterministic replay; injected data loader.
- [x] 0.5 Adopt `decks/current.md`: update `sim/deck.mjs`, rerun `odds.mjs` and the hand-class lines (Thrasher and Prosperity lines are gone), report old vs new numbers, add Number 62 and side-deck card text to `docs/CARDS.md`, and run the unknown side card 97045738 through the data-update check.
- [x] 0.4 Golden tests: the 5 replays run through the library API in `npm test` (same results as `scripts/verify.sh`).
Done when: library API passes all 5 replays and the 48 app tests, and the numbers in CLAUDE.md match the current list.

## Wave 1: Deck lab (medium)
Mostly a port of what already works headlessly, so high value for low cost.
- [x] 1.1 Port `odds.mjs` into `packages/analysis` (TypeScript). Hand classes read from the pack's line table, not hard-coded.
- [x] 1.2 Stats: full board, Nibiru-proof, full + k hand traps, brick, going-2nd hand-trap counts, per-card marginal value. Always several numbers, never one score.
- [x] 1.3 Quick calculator: community-style (pick cards, min/max copies, 2-card pairs, "needs Normal Summon" flag), plus tag a card's role once and it is remembered.
- [x] 1.4 Deck import and export: `.ydk` (EDOPro folders, several installs), `ydke://`, Omega codes; Drive sync by pointing the deck folder at a Drive-synced folder.
- [x] 1.5 Deck version history: every edit saved with its change in odds.
- [x] 1.6 Data update command: pull new cards and scripts, report changed cards, run the regression gate. (New-card flow, part 1.)
- [x] 1.7 Deck editor (added on user feedback, 12 Nov 2026): EDOPro-style deck building with card search and filters, Main / Extra / Side, limits, open from and save to EDOPro's deck folder.
Done when: you can paste a list, see every number, edit it, and see the difference.

## Wave 2: Duel client and save states (large)
- [x] 2.1 Electron shell + board UI: field, hand, GY, banish, Extra Deck, overlay materials, card detail. **design**
- [x] 2.2 Prompts to UI: select card/zone/position/option, yes-no, chain, and EDOPro-style hotkeys, auto-chain and speed (animations off or fast by default).
- [x] 2.3 Goldfish duel: draw a hand from a deck, play it out, finish turn.
- [x] 2.4 Save states: quick save/load, undo, branch tree (seed + response log).
- [x] 2.5 Chat panel: events and key info (chain, hand-trap windows, Nibiru windows, notes).
- [x] 2.6 Loads EDOPro's deck folder and card database.
- [ ] 2.7 Look and feel (user, 12 Nov 2026: the first duel screen is "awfully designed", not EDOPro, no snappiness, no animations). Rework the duel screen against real EDOPro screenshots: its field textures and proportions, card sizes, window style, fonts; fast animations for draw, summon, move, chain, attack; instant response to clicks. Function from 2.1 to 2.6 stays. **design**
Done when: you can play a full turn-1 Galaxy-Eyes line by hand, quick-save at any point and branch from it.

## Wave 3: Drill mode, knowledge base, feedback (medium)
- [x] 3.1 Knowledge base format: lines, roles, rulings, regression cases, in the pack. **design**
- [x] 3.2 Drill mode: random hand, you play it, compare with the library's best line, grade.
- [x] 3.3 Personal results log: your real brick and full-board rates against the exact odds.
- [x] 3.4 "That's wrong" button, role tagging (right-click), notes attached to a state.
- [x] 3.5 Post-duel review: asks "why?" only where you left the stored line.
Done when: a drill session produces a grade, and a correction changes what the next drill expects.

## Wave 4: Replay takeover and Omega (medium)
- [ ] 4.1 Omega replay parser into engine responses (reuse `follow2` logic), then EDOPro `.yrpX`.
- [ ] 4.2 Scrub to any step, restore, hand control to you.
- [ ] 4.3 Omega replay-folder watcher: auto-parse, replay, flag new lines and illegal plays.
- [ ] 4.4 Ruling diff report (where Omega allows what EDOPro's scripts forbid); deck-code export.

## Wave 5: Optimiser and hand-trap play (large)
- [ ] 5.1 Line library: entry, shared middle states, finish; the replay-verified lines become data. **design**
- [ ] 5.2 Plan-guided search seeded from the library (plain beam undercounts).
- [ ] 5.3 Nibiru fire-or-hold and minimax over hand-trap windows (opponent chooses timing).
- [ ] 5.4 Practice partner: scripted mode (e.g. Ash on first search), then smart mode, random, user scripts.
- [ ] 5.5 Bait search: which lead plays through which hand trap. Answers the three open questions in `CLAUDE.md`.

## Wave 6: Video and Discord share (medium)
- [ ] 6.1 Replay to mp4/GIF with captions (frames rendered headless, ffmpeg).
- [ ] 6.2 Discord webhook sharing: odds table, drill result, line card, clip.
- [ ] 6.3 Discord Rich Presence.

## Wave 7: Opponent boards and breakthroughs (medium to large)
- [ ] 7.1 Opponent board library: import end boards from replays; "can I break this, and with what?"
- [ ] 7.2 Going-2nd breakthrough search against stored boards.
- [ ] 7.3 Matchup lab: your lines against several interaction sets.

## Wave 8: Other decks and new cards (medium)
- [ ] 8.1 Auto-derived card roles from script categories and text.
- [ ] 8.2 Pack scaffold for a new deck; learning loop fills it.
- [ ] 8.3 New-card flow part 2: regression across all packs when scripts change.

## Wave 9: Mobile (medium). See `docs/MOBILE.md`.

## Wave 10: Social and extras (as wanted)
Discord bot and commands, testing partners, team sync, Drive API sync (only if the synced folder is not enough), self-review, banlist impact report, line map, hide-the-hint mode, stream overlay.

## Parked (do not start unless the user raises it)
Tech cards. Sideboarding.
