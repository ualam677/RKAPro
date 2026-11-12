# Galaxy deck simulator: where things stand (10 Nov 2026)

## What works
- The real EDOPro rules engine (ocgcore-wasm 0.1.6) runs headless, using the ProjectIgnis card scripts.
  - Card data comes from /tmp/babel. Scripts come from /tmp/cardscripts, and constant.lua + utility.lua must be preloaded.
- The deck order and opening hand are forced with PSEUDO_SHUFFLE plus bottom insertion (engine.mjs).
- Whole-engine snapshot/restore takes about 0.3 ms per restore (state.mjs).
- beam.mjs is a beam search over our idle prompts:
  - It never fires our own hand traps.
  - Prosperity banishes the least-needed Extra Deck cards first.
  - It has an `interrupt` hook for opponent prompts, a `guide` bonus for known lines, and `stopAt` for early stopping.
  - It returns `resps`, which `replayLine()` can replay exactly.
- board.mjs scores the end board as interruptions on the opponent's turn:

  | Piece | Score |
  |---|---|
  | Photon Lord | 1.25 |
  | Harbinger | 1 |
  | Howling | 1 |
  | Transmigration with a Galaxy-Eyes | 1 |
  | Eternal Galaxy → Lord/Harbinger | 1 |
  | Photon Blast | 0.5 |

  The objective is board + 0.8 × hand traps kept.
- follow.mjs DELTA_LINE replays the user's Delta Wing replay. It scores board 4 and keeps all 4 hand traps.

## Results so far (one starter + 4 hand traps, beam width 60)

| Starter | Board | Hand traps kept |
|---|---|---|
| Orbital 7 | 4.25 | 4 |
| Schwarzschild | 4.0 | 4 |
| Soldier | 4.25 | 3 (discards a LIGHT) |
| Seventh Tachyon | 4.0 | 3 |
| Delta Wing | 3.25 (user line 4.0, so this is a search miss) | 4 |
| Wizard | 3.25 | 4 |
| Prosperity | 3.25 | 4 |
| Thrasher | 3.25 | 3 |

- The search is width-sensitive. At width 12, Delta and 7th Tachyon only reached 1.0. At width 24 they reached 2.25 and 3.25.
- Speed is about 1.5–2 ms per game state, so 6–30 s per hand on 2 cores.

## Scale problem
- Hand traps can be merged into 3 groups:
  - L: Veiler, Ogre. These are the only cards that matter as Soldier fodder.
  - M: Ash, Fuwalos, Droll.
  - S: Imperm.
- Even with that merge, there are 24,988 distinct 5-card hands.
  - 1,941 hands cover 50% of the probability; 11,101 cover 90%.
  - Going second (6 cards) has 81,638.
- An all-hand-trap hand happens 0.45% of the time going first.
- Brute force over 90% of hands would take about 23 h on this machine, so the next step changes the method instead.

## Next steps (planned)
1. **Small-set table.** Going first, the board value is monotone in hand contents.
   - Solve every single engine card and every pair, plus a no-LIGHT-fodder variant for Soldier sets and 3 shuffles for Prosperity sets. That is about 330 solves.
   - Hand value = max over the singles and pairs it contains. Probabilities are exact via the hypergeometric (sim/classes.mjs enumerates every hand).
   - Validate against about 60 random full hands solved wide.
2. **Record deck usage per line** (deck at the end vs the start). For variants that remove a card (Wizard, Thrasher, War Drake), re-solve only the entries whose line pulled that card.
3. **Playbook guidance.** Seed the search with the user's replays and the best singles lines, which fixes misses like Delta.
4. **Hand-trap resilience.** The opponent holds Ash, Imperm/Veiler, Droll, Nibiru or Ogre and fires it at the 1st/2nd/3rd chance; take the worst case.
   - Snapshot the hook counter together with the heap.
   - Count Special Summons from the Deck/Extra Deck as Fuwalos draws.
5. **Variants.** Compare 43 now; 42 without Wizard; Soldier 2/3; Veiler/Imperm counts; Prosperity in/out; Thrasher + War Drake in/out; 44.

## Update: lightweight model (route recipes + exact maths)
- **Script:** ygo-ratio/scratch/routes.ts.
  - It turns the 5 user replays (/home/claude/replays_in) into exact recipes: hand / must-stay-in-Deck / anywhere-in-40.
  - It runs the app's hypergeometric engine on them. One deck evaluates in about 0.1 s, so all variants take about 1 s.
- **Going first, verified routes only:** 61.6% (strict). It rises to 72.0% if Photon Orbital, War Drake and GEPD count as fine from the hand (card text says so).
  - A further +17.5% of hands rely on 7th Tachyon, Prosperity, Wizard or Thrasher, which have no replay yet.
- **Importer fixes:**
  - Omega replay Deck0 codes have 4 trailing bytes; the parser now ignores them.
  - Alternate-art passcodes now fall back to the base card up to 10 below (Omega's Ogre 59438932 and Imperm 10045475).
- **Engine use from now on:** only targeted spot-checks:
  - starter + opened 1-of that the recipe needs from the Deck (Emperor, Afterglow…),
  - Nibiru at the 5th summon for each route,
  - one hand trap at each choke point.

## Update: exact replay re-simulation + Nibiru (10 Nov, later)
- **sim/follow2.mjs: exact replay follower.** It aligns engine messages (moves, summons, activations) with the replay's messages, using a 12-wide beam over choices.
  - Material transfers (Material>Material) are optional matches.
  - Skipping replay events is penalised.
  - ocgcore-wasm marks Xyz materials with `overlay_sequence`; the location is then the parent's location.
  - Replays exactly: Delta 70/70 (board 4), Orb7 r1 60/60 (4.25), Orb7 r2 69/69 (4.25).
  - Still partial: Schwarz 68/79, Soldier 51/92.
- **sim/check2.mjs `nib:K`:** follow the exact line until Nibiru (opponent fires at the K-th legal chance), then try every response to Nibiru and beam-search the rest.

  | Route | Nibiru at chance 1–2 | Nibiru at chance 3+ | Worst case |
  |---|---|---|---|
  | Orb7 routes | chain Tachyon Transmigration from hand (N107 on field) → 3.25 | Photon Lord negates → 4.25 / 3.25 | 3.25 |
  | Delta | — | — | 0 at chance 3 |

  - Orb7 routes are Nibiru-proof; Delta is not, matching the user's label.
  - **Pattern:** a line is Nibiru-proof if a Nibiru answer is live from the 5th summon onward. The answers are N107 + Transmigration in hand, or Photon Lord with material.
- **beam.mjs additions:** `prefix` (replay responses, then search), `guide` now uses LCS, `istate`, and an interrupt state that is snapshotted with the heap.

## Update: all 5 replays exact + Nibiru on every route (10 Nov, session 3)
- Antimatter ruling fixed in engine.mjs (usable turn 1; user ruling). Soldier line needs it (detach Starliege → War Drake Deck→GY).
- follow2 now strict by default: summons/activations not in the replay cost 40 (LOOSE=1 for old behaviour). Without it the beam slipped in Antimatter-over-Howling or a Howling negate and still "matched".
- All 5 replays reproduce event-for-event AND end on the user's exact boards: Delta 70/70, Orb7 r1 60/60, Orb7 r2 69/69, Soldier 92/92, Schwarz 79/79.
- sim/diff.mjs <route> [a-b]: replay vs engine events side by side (ALL=1 includes material transfers).
- Nibiru, fire at chance K (5th summon onward), engine's best answer + finish (beam width 20):

  | Route | K=1 | 2 | 3 | 4 | 5 | 6 | worst | answer |
  |---|---|---|---|---|---|---|---|---|
  | Orb7 r1 | 3.25 | 3.25 | 4.25 | 3.25 | – | 4.25 | 3.25 | Transmigration from hand / Lord |
  | Orb7 r2 | 3.25 | 3.25 | 4.25 | 4.25 | – | 3.25 | 3.25 | same |
  | Soldier | 2.5 | 4.25 | 4.25 | 4.25 | 4.25 | 4.25 | 2.5 | Photon Lord negates (Lord already out at 5th summon) |
  | Schwarz | 3 | 3 | 3 | 2 | 3 | 3 | 2 | Transmigration from hand (N107 out) |
  | Delta | 3 | – | 0 | 1 | – | 0 | 0 | none |
- Matches the user's labels exactly. Worst-case-over-K = opponent choosing when to fire with our line fixed (a lower bound; we don't yet adapt the line in anticipation).

## Correction (10 Nov, later): Antimatter ruling is EDOPro's (user confirmed Omega is wrong)
- Antimatter detach effect not usable turn 1. Default is EDOPro again; YGO_OMEGA_RULINGS=1 only to replay Omega lines.
- The user's Soldier replay is illegal from raw event 39 (Antimatter activation → War Drake Deck→GY). Its 4.25 board was Omega-only.
- sim/fixline.mjs <route> <cut> [width] [secs]: follow the replay for <cut> events, then search the best legal finish.
  - Soldier cuts 22/26/30/39 → best 3.25 (Lord + Howling[4] + Transmigration, no Eternal Galaxy).
  - BUT the Nibiru branch (Lord negates Nibiru at chance 2) reaches 4.25 legally: GPD, Howling[3], Lord[1], Transmigration + Eternal Galaxy. So a legal 4.25 exists and the plain searches missed it → search has gaps (lesson: seed searches from successful branches / reuse lines across perturbations).
- Nibiru rerun under EDOPro ruling:
  - Soldier: 2.5 at chance 1, 4.25 at chances 2–6 (Photon Lord negates). Worst 2.5. Nibiru-proof.
  - Schwarz: 3 at every chance 1–6 (Transmigration from hand). Worst 3 (the earlier 2 was search noise). Nibiru-proof.

## Update: exact odds model from verified lines (sim/odds.mjs, ~18 s per 12 variants)
- evalHand: verified lines as lower bounds. Orb7 4.25, Schwarz 4, Seventh 4 (reveal N107 → Infinity; plain beam MISSED it, scripted start found 4), Delta 4 (not nib-proof), Wizard 3.25, Soldier+another LIGHT 4.25 (discards Veiler/Ogre only if no other LIGHT), Photon Orbital + Summoner/War Drake/Thrasher 4, Thrasher+War Drake 3.25, Thrasher + Summoner/Fuwalos/War Drake 2.25 (4.25 with Eternal Galaxy), Prosperity = excavate-3 dig.
- Engine findings: Thrasher + Fuwalos is a starter (2 L4 → Galaxy Photon Dragon); Summoner + Photon Orbital and War Drake + Photon Orbital reach 4.25. Brick check: 14 sampled model-bricks, 12 true bricks, 2 were Thrasher+Fuwalos (now modelled).
- sim/scripted.mjs: force a start by label regexes, then beam. The beam alone undercounts (Seventh 1 vs 4, Delta 3 vs 4).
- HT live going 1st: Ash, Imperm, Veiler, Ogre, Droll (Fuwalos dead). Going 2nd: + Fuwalos.
- Current 43: going 1st full board 93.5%, Nibiru-proof 83.8%, full+1HT 78.4%, full+2HT 41.4%, brick 5.9%. Going 2nd ≥2HT 74.0%, ≥3HT 39.4%.
- Blind spot: metrics are "full board or not" without opponent interaction, so extenders (War Drake, Thrasher's free NS, 2nd starters) show ~no value. Needs the hand-trap phase.

## Update: hand traps (sim/ht.mjs, sim/bait.mjs)
- ht.mjs <route> <HT>: fire the HT at the K-th legal window along the user's exact line; try chain responses; re-plan. Bug fixed: "End turn" as a response made the prefix run into turn 3.
- bait.mjs "<hand>" <HT> "<lead re1||re2..>" (GUIDE=route): plan = best uninterrupted line with that lead; HT at every window along the plan; worst over K. Only trust it when the uninterrupted plan is a full board.
- Ash, single starter + fillers: Orb7 routes: on Orb7 → 0, Dragluxion → 2.25, Howling → 3.25, from Photon Lord on Lord negates (4.25). Schwarz: on Infinity → 0, Dragluxion → 2, Primal/Afterglow → 3. Delta: on Delta / GPD search / searched Orb7 → 0 (three dead points).
- Infinity + Orb7 vs Ash: lead Infinity worst 3 (Ash on Infinity → 4 via Orb7); lead Orb7 worst 0 (Ash on the Delta it fetches; Infinity then dead because you control a monster).
- Seventh + Orb7 vs Ash (reveal N107 → Infinity): put back a hand trap → Ash on Seventh 3, on Infinity 4, mid-line 3.5–4, late 2 (plan only 3, noisy). Put back Orb7 → Ash on Infinity = 0.
- Orb7 + Delta: both leads hit 0 but plans were weak (3/3.5 uninterrupted) — untrusted; asked user.
