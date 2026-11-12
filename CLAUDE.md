# CLAUDE.md — RKAPro (custom EDOPro-core client for deck testing; repo: ygo-lab)

Product vision and name: `docs/VISION.md` (RKAPro: EDOPro-core client for deck testing, with YGO Omega and Discord integration). Architecture: `docs/ARCHITECTURE.md`; features: `docs/DESIGN.md`.
Read this first, then `docs/KNOWLEDGE.md` (deck knowledge, user-taught), `docs/NOTES.md` (engineering log and results) and `docs/CARDS.md` (the real card texts of every card in the deck).

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
- **Starters are entry points into one shared structure**, not separate combos (Delta Wing, Thrasher + a Level 4, Orbital 7, Soldier + LIGHT, Infinity Dragon all lead to the same Dragluxion → Howling/Lord → Eternal Galaxy finish).
- Report several numbers, not a single score; the user decides the risk/reward trade-off.
- YGO Omega can be wrong on rulings. EDOPro's scripts are the reference. When a replay step fails in the engine, check the card script, then tell the user (example: Galaxy-Eyes Antimatter Dragon's detach effect cannot be used on turn 1; Omega allowed it, so the Soldier replay is not legal as recorded).
- Keep replies short. The user is a competitive player who knows the deck far better than the search does; treat their corrections as ground truth and record them in `docs/KNOWLEDGE.md`.
- **Fuwalos stays at 3** (user decision, not a flex slot). **Sideboarding and tech cards are parked** until the main deck's weaknesses are understood and the user brings them up.

## Repo layout
```
sim/            headless duel engine + search (Node, ocgcore-wasm = EDOPro's core)
  engine.mjs    load card DB + Lua scripts, create duels, run to the next prompt; heap snapshot/restore
  choices.mjs   turn engine prompts into labelled options ("Activate X (hand)", "Chain Y", "Pick Z (Deck)")
  deck.mjs      the user's deck (MAIN/EXTRA), id(name), mainList(), extraList()
  beam.mjs      beam search over a turn: beamSolve(hand, deck, {width, prefix, guide, interrupt, timeLimitMs})
  board.mjs     board scoring (≈ interruptions): Photon Lord 1.25, Harbinger 1, Howling 1 (needs ≥3 materials + another Xyz), Transmigration 1, Eternal Galaxy 1, Photon Blast 0.5
  tools/        experiments (see "Tools" below)
  data/         card DB + scripts (git-ignored; scripts/setup.sh downloads them)
app/            the web app (React/TS/Vite, vitest): deck import (.ydk, ydke://, Omega codes, text recipes), staged ratio optimiser
replays/        the user's 5 YGO Omega replays + learned.json (parsed events, guides)
docs/           KNOWLEDGE.md, NOTES.md, CARDS.md
scripts/setup.sh
```

## Setup and commands
```
./scripts/setup.sh                                 # clones ProjectIgnis BabelCDB + CardScripts into sim/data, npm installs
cd app && npx vitest run                           # 48 tests
cd sim && node tools/check2.mjs <route 0-4> plain  # replay the user's line exactly; routes: 0 Delta, 1 Orb7 r1 (Wizard), 2 Orb7 r2 (Thrasher), 3 Soldier, 4 Schwarzschild
node tools/check2.mjs <route> nib:K                # Nibiru fires at the K-th chance; best response + finish
node tools/ht.mjs <route> "<hand trap>"            # hand trap at every legal window along the user's line
node tools/bait.mjs "<card,card>" "<hand trap>" "<lead regex||next||...>"  # GUIDE=<route>; worst case per lead = bait test
node tools/odds.mjs                                # exact odds, current deck + variants (~18 s)
node tools/scripted.mjs "<hand>" "<re1||re2>" [guideRoute]  # force a start, then search
node tools/diff.mjs <route> [a-b]                  # replay vs engine events side by side
node tools/fixline.mjs <route> <cut>               # follow the replay for <cut> events, then best legal finish
```
Env: `YGO_CDB_DIR`, `YGO_SCRIPTS_DIR` override data paths. `YGO_OMEGA_RULINGS=1` copies Omega's wrong Antimatter ruling (only for replaying Omega lines). `LOOSE=1` makes the replay follower tolerate extra summons/activations.

## Engine facts and gotchas (learned the hard way)
- ocgcore messages: 50 move, 60/62 summon, 70 activate, 40 new turn. Xyz materials show as `overlay_sequence` with the parent's location (`follow2.mjs` maps them to "Material").
- Omega replay export: the `Deck0` code carries 4 trailing bytes. Alt-art passcodes sit a few numbers above the base passcode (59438932 Ghost Ogre, 10045475 Impermanence); `app/src/lib/cards/resolve.ts canonicalCode` maps them.
- Replay follower (`tools/follow2.mjs`) is a beam that aligns engine events with the replay's events. It is strict by default: summons/activations not in the replay cost 40, otherwise it slips in extra plays and still "matches".
- **The plain beam search undercounts.** Seventh Tachyon alone scored 1 (real: 4 via reveal N107 → Infinity Dragon), Delta 3 (real 4), a legal Soldier 4.25 board was found only in a Nibiru branch. Treat search values as lower bounds; seed searches with replay guides (`guide`), scripted starts, or plans from successful branches.
- Never pass an "End turn" option as a response inside a prefix: the replay runs into the opponent's turn and the search plays turn 3 off a fresh draw.
- Interrupt functions (opponent hand traps) receive `(prompt, choices, log)`; target the card from the last type-70 message of player 0. Opponent deck for tests: [hand trap + 39 Dark Magician].
- Hand traps live going 1st: Ash, Imperm (set), Veiler, Ogre, Droll. Fuwalos is dead going 1st (needs you to control no cards).

## What is verified so far (details and tables in docs/NOTES.md)
- All 5 replays reproduce event-for-event and end on the user's exact boards (Soldier only with Omega's ruling).
- Nibiru-proof (user's definition: on summon 5, Photon Lord on field, or Tachyon Dragon on field so Transmigration is live; forcing Nibiru on summon 5 because summon 6 builds a negate also counts): Orbital 7 routes (worst 3.25), Soldier (2.5), Schwarzschild (3) yes; Delta no (0).
- Exact odds, current 43: going 1st full board 93.5%, Nibiru-proof 83.8%, full + 2 hand traps 41.4%, brick 5.9%; going 2nd ≥2 hand traps 74%. Starter ↔ hand trap swap ≈ −1.5% full boards, −3% Nibiru-proof, +4% full+2HT, +4% going-2nd ≥2HT.
- Keep 1 Wizard + 1 Thrasher (Thrasher = Orbital 7's Normal-Summon-free route; 2nd Wizard only saves ~1.5% of hands).
- Engine discoveries: Thrasher + any Level 4 (incl. Fuwalos) → Galaxy Photon Dragon; Photon Orbital + Summoner/War Drake/Thrasher = full board.
- Hand traps: one-starter hands die to Ash on the first search. Infinity Dragon + Orbital 7: lead Infinity (worst 3) not Orbital 7 (worst 0: Infinity is stranded once you control a monster). Seventh Tachyon: put back a hand trap or brick, never the backup starter.

## Open questions for the user
1. How do you play through Ash on Dragluxion's search? (engine keeps only 2–2.25)
2. Orbital 7 + Delta in one hand: which do you lead with to play through Ash?
3. A legal Soldier line (without the turn-1 Antimatter effect) as an Omega replay.

## Product decisions (user, 12 Nov 2026) — details in docs/DESIGN.md
- Desktop app (Electron), the user plays duels themselves.
- Build first (order and slices in docs/ROADMAP.md): **drill mode**, **odds + all the stats** (our engine-verified classes plus what community tools do), **replay → mp4/GIF video**, plus the new-card update flow and the "that's wrong" button.
- Later ideas the user liked: going-2nd breakthrough search against meta boards, matchup lab, self-review, shareable lines.

## Roadmap
Build in waves, most important first: `docs/ROADMAP.md` (session protocol and slices). Resume point: `docs/PROGRESS.md`. Read only those two plus this file at the start of a session. Mobile design: `docs/MOBILE.md`. Waves 0 to 3 are the minimum useful product.

Licensing: ocgcore and ProjectIgnis CardScripts are AGPL-3.0, so a distributed clone must be AGPL too. Card artwork is Konami's; don't bundle it. YGO Omega is closed source; integrate through its replay and deck-code formats only.
