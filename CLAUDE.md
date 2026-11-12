# CLAUDE.md — RKAPro (custom EDOPro-core client for deck testing)

Product vision and name: `docs/VISION.md` (RKAPro: EDOPro-core client for deck testing, with YGO Omega and Discord integration). Architecture: `docs/ARCHITECTURE.md`; features: `docs/DESIGN.md`.
Start of session: this file, `docs/PROGRESS.md` and the current wave in `docs/ROADMAP.md`. Open the rest only when the slice needs it: `docs/KNOWLEDGE.md` (deck knowledge, user-taught), `docs/NOTES.md` (engineering log and results), `docs/CARDS.md` (the real card texts of every card in the deck) and `decks/current.md` (the user's current list).
Engine internals, message codes and search pitfalls: the `engine-gotchas` skill. Odds and stats method: the `odds-and-stats` skill. Long verification runs: the `line-verifier` subagent.

## The goal (from the user)
Build a true EDOPro-style duel simulator, integrated with YGO Omega, that has:
- a built-in **optimiser** that finds the best lines on its own,
- a **ratio counter** (exact odds for deck lists and variants),
- **replay takeover** (load an Omega or EDOPro replay, jump to any point and play on from there),
- **save states** (snapshot/restore any game state),
- and that **learns**: recognises patterns across lines, gets better from the user's replays and corrections, then moves on to tech cards and playing through hand traps.

Long-term loop: the user teaches → the software masters the archetype → it teaches the user → the user gives better input.
Priorities, in order: master the current deck (Galaxy-Eyes / Photon / Galaxy, TCG) → play through hand traps → tech cards → sideboarding (parked, see below).

## How to work with this user
- **Read the card text before asking or reasoning about a card.** `docs/CARDS.md` has every deck card. The user was rightly annoyed when I asked things the cards answer.
- **Test, don't guess.** If a question can be settled with the engine or exact maths, do that. Ask the user only what neither can settle (their judgement, what they actually do in a spot, rulings the scripts get wrong).
- **Prefer lightweight, clever methods over brute force.** The user stops long brute-force runs. Exploit structure: lines converge on shared middle states; use exact hypergeometric maths; reuse verified lines as plans and guides.
- **Starters are entry points into one shared structure**, not separate combos (Delta Wing, Orbital 7, Soldier + LIGHT, Infinity Dragon, Seventh Tachyon, Galaxy Wizard all lead to the same Dragluxion → Howling/Lord → Eternal Galaxy finish). Photon Thrasher is out of the current list.
- Report several numbers, not a single score; the user decides the risk/reward trade-off.
- YGO Omega can be wrong on rulings. EDOPro's scripts are the reference. When a replay step fails in the engine, check the card script, then tell the user (example: Galaxy-Eyes Antimatter Dragon's detach effect cannot be used on turn 1; Omega allowed it, so the Soldier replay is not legal as recorded).
- Keep replies short. The user is a competitive player who knows the deck far better than the search does; treat their corrections as ground truth and record them in `docs/KNOWLEDGE.md`.
- **Fuwalos stays at 3** (user decision, not a flex slot). **Sideboarding and tech cards are parked** until the main deck's weaknesses are understood and the user brings them up.

## Repo layout
```
packages/engine/  engine library, no Node-only imports (host injects ocgcore-wasm, card data, script reader)
  core.mjs      initEngine, newDuel, runUntilPrompt (the only code that talks to ocgcore)
  choices.mjs   turn engine prompts into labelled options ("Activate X (hand)", "Chain Y", "Pick Z (Deck)")
  api.mjs       createDuel -> options(), respond(), snapshot()/restore(), actionLog(); replay(log); save state = decks + seed + responses
  state.mjs, board.mjs   heap snapshot/restore; read a side of the field
  client.mjs    duel client protocol: view(duel) = screen model, uiPrompt/answer/autoAnswer; hand-trap window notes in the chat log
  session.mjs   a duel as the player sees it: act(), undo(), save()/loadSession(), notes; opponent and trivial prompts answered automatically
packs/galaxy-eyes/ deck.json (current list + replay list), lines.json (hand classes for the odds), board.mjs (scoring), golden/ (action logs of the 5 replays)
sim/            Node host + search + tools (ocgcore-wasm = EDOPro's core); choices/state/board/deck.mjs re-export the above
  engine.mjs    load card DB + Lua scripts from disk, inject them into packages/engine
  server.mjs    local duel server (HTTP, port 7911): /api/duel, /api/saves, /api/cards, /api/pic, /api/decks; uses the EDOPro install (EDOPRO_DIR, default C:ProjectIgnis)
  deck.mjs      the current list (MAIN/EXTRA), REPLAY_MAIN (the list the replays were recorded on), id(name), mainList(), extraList()
  beam.mjs      beam search over a turn: beamSolve(hand, deck, {width, prefix, guide, interrupt, timeLimitMs})
  board.mjs     (-> packs/galaxy-eyes/board.mjs) board scoring (≈ interruptions): Photon Lord 1.25, Harbinger 1, Howling 1 (needs ≥3 materials + another Xyz), Transmigration 1, Eternal Galaxy 1, Photon Blast 0.5
  tools/        experiments (commands below)
  data/         card DB + scripts (git-ignored; scripts/setup.sh downloads them)
packages/analysis/ odds.ts (exact odds from a pack line table, per-card marginals), quick.ts (tag-based community-style calculator)
app/            the app (React/TS/Vite, vitest): deck import/export, exact stats, quick calculator, deck folders, version history, staged ratio optimiser
decks/          the user's current list (Omega code + decoded, with diff vs the old list)
replays/        the user's 5 YGO Omega replays + learned.json (parsed events, guides)
docs/           VISION, ARCHITECTURE, DESIGN, ROADMAP, PROGRESS, MOBILE, KNOWLEDGE, NOTES, CARDS, claude-code-setup/
scripts/        setup.sh (data + deps), verify.sh (replays all 5 lines; the regression gate)
```

## Setup and commands
```
./scripts/setup.sh                                 # clones ProjectIgnis BabelCDB + CardScripts into sim/data, npm installs
./scripts/verify.sh                                # all 5 replays, one line each (~4 min); must stay green
cd app && npx vitest run                           # 58 tests
cd app && npm run dev                              # the whole app in the browser (also starts the duel engine); Duel tab + Deck lab tab
cd app && npm run desktop                          # the desktop app (Electron): builds the UI, engine in-process
cd app && npm run ui-check                         # needs `npm run dev` running: headless Edge drives the real UI (16 steps), screenshots in app/ui-shots
cd app && npm run build && node scripts/desktop-check.mjs   # launches the real Electron window and checks a hand is dealt
node tools/odds.mjs marginals                      # per-card -1/+1 table
node tools/update-data.mjs [--check]               # pull card data, report changes, run the gate, pin (sim/data.lock.json) or roll back
cd sim && npm test                                 # 22 tests (~25 s): golden replays through the API; duel client protocol (random player, recorded lines click by click)
node tools/golden.mjs <route...>                   # regenerate a golden action log (only when a replay or the engine API changes)
cd sim && node tools/check2.mjs <route 0-4> plain  # replay the user's line exactly; routes: 0 Delta, 1 Orb7 r1 (Wizard), 2 Orb7 r2 (Thrasher), 3 Soldier, 4 Schwarzschild
node tools/check2.mjs <route> nib:K                # Nibiru fires at the K-th chance; best response + finish
node tools/ht.mjs <route> "<hand trap>"            # hand trap at every legal window along the user's line
node tools/bait.mjs "<card,card>" "<hand trap>" "<lead regex||next||...>"  # GUIDE=<route>; worst case per lead = bait test
node tools/odds.mjs                                # exact odds, deck + variants (~1 s)
node tools/cardcheck.mjs <passcode|name>           # look a card up in every cdb, incl. ones the engine does not load
node tools/scripted.mjs "<hand>" "<re1||re2>" [guideRoute]  # force a start, then search
node tools/diff.mjs <route> [a-b]                  # replay vs engine events side by side
node tools/fixline.mjs <route> <cut>               # follow the replay for <cut> events, then best legal finish
```
Env: `YGO_CDB_DIR`, `YGO_SCRIPTS_DIR` override data paths. `YGO_OMEGA_RULINGS=1` copies Omega's wrong Antimatter ruling (only for replaying Omega lines). `LOOSE=1` makes the replay follower tolerate extra summons/activations.

## What is verified so far (details and tables in docs/NOTES.md)
Numbers are for the current list (`decks/current.md`, adopted in slice 0.5). The 5 replays were recorded on the previous list and are replayed on it (`REPLAY_MAIN` in `sim/deck.mjs`); `NEWLIST=1 node tools/check2.mjs <route> plain` tries a line on the current list.
- All 5 replays reproduce event-for-event and end on the user's exact boards (Soldier only with Omega's ruling). On the current list 4 of them still do (Delta 4, Orbital 7 via Wizard 4.25, Soldier 4.25, Schwarzschild 4 with Dragluxion attaching Number 62 instead of S38); the Orbital 7 Thrasher route is gone.
- Nibiru-proof (user's definition: on summon 5, Photon Lord on field, or Tachyon Dragon on field so Transmigration is live; forcing Nibiru on summon 5 because summon 6 builds a negate also counts): Orbital 7 routes (worst 3.25), Soldier (2.5), Schwarzschild (3) yes; Delta no (0).
- Exact odds, current 43 (old list in brackets): going 1st full board 93.3% (93.5), Nibiru-proof 85.4% (83.8), full + 2 hand traps 41.3% (41.4), brick 6.7% (5.9); going 2nd ≥2 hand traps 74.0% (74.0). Starter ↔ hand trap swap ≈ −1.5% full boards, −3% Nibiru-proof, +4% full+2HT, +4% going-2nd ≥2HT.
- 2 Wizard vs 1 Wizard + 1 Thrasher on the current shell (no hand traps modelled): 93.3 / 85.4 / brick 6.7 vs 92.3 / 83.8 / brick 7.2. The model does not see Thrasher's value as Orbital 7's Normal-Summon-free route under hand traps. Wizard alone: 3.25 with Photon Lord (engine, current list).
- Engine discoveries: Photon Orbital + Summoner/War Drake = full board. (Old list: Thrasher + any Level 4 → Galaxy Photon Dragon.)
- Hand traps: one-starter hands die to Ash on the first search. Infinity Dragon + Orbital 7: lead Infinity (worst 3) not Orbital 7 (worst 0: Infinity is stranded once you control a monster). Seventh Tachyon: put back a hand trap or brick, never the backup starter.

## Open questions for the user
1. How do you play through Ash on Dragluxion's search? (engine keeps only 2–2.25)
2. Orbital 7 + Delta in one hand: which do you lead with to play through Ash?
3. A legal Soldier line (without the turn-1 Antimatter effect) as an Omega replay.

## Product decisions (user, 12 Nov 2026) — details in docs/VISION.md and docs/DESIGN.md
- Desktop app (Electron), the user plays duels themselves; EDOPro-compatible files, all decks via packs.
- Build first (order and slices in docs/ROADMAP.md): **odds + all the stats**, **duel client with save states**, **drill mode**, then replay takeover, optimiser, **replay → mp4/GIF video**, Discord, opponent boards, other decks, mobile.
- Also in: new-card update flow, "that's wrong" button, personal results log, deck version history, opponent board library.

## Roadmap
Build in waves, most important first: `docs/ROADMAP.md` (session protocol and slices). Resume point: `docs/PROGRESS.md`. Read only those two plus this file at the start of a session. Mobile design: `docs/MOBILE.md`. Waves 0 to 3 are the minimum useful product.

Licensing: ocgcore and ProjectIgnis CardScripts are AGPL-3.0, so a distributed clone must be AGPL too. Card artwork is Konami's; don't bundle it. YGO Omega is closed source; integrate through its replay and deck-code formats only.