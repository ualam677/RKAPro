---
name: engine-gotchas
description: Hard-won facts about the ocgcore engine, the Omega replay format, the replay follower and the beam search. Load before changing sim/engine.mjs, choices.mjs, beam.mjs or tools/follow2.mjs, or when a replay step fails.
---
- ocgcore messages: 50 move, 60/62 summon, 70 activate, 40 new turn. Xyz materials appear as `overlay_sequence` with the parent's location; `follow2.mjs` maps them to "Material".
- Omega export: the `Deck0` code has 4 trailing bytes. Alt-art passcodes sit a few numbers above the base (59438932 Ghost Ogre, 10045475 Impermanence); `app/src/lib/cards/resolve.ts canonicalCode` maps them.
- EDOPro scripts are the ruling authority. Omega is sometimes wrong (Galaxy-Eyes Antimatter Dragon's detach effect cannot be used on turn 1). When a replay step fails: read the card script first, then tell the user. `YGO_OMEGA_RULINGS=1` copies Omega only to replay Omega lines; log differences in the rulings notes.
- The replay follower is a beam aligning engine events to replay events. It is strict by default (extra summons/activations cost 40; `LOOSE=1` relaxes). Without strictness it slips in extra plays and still "matches".
- The plain beam search undercounts: Seventh Tachyon alone scored 1 (real 4 via reveal N107 then Infinity), Delta 3 (real 4). Treat values as lower bounds; seed with `guide` (replay), scripted starts (`tools/scripted.mjs`) or plans from successful branches.
- Never put an "End turn" option in a response prefix: the replay runs into the opponent's turn and the search plays turn 3.
- Interrupt functions get `(prompt, choices, log)`; the target is the card from the last type-70 message of player 0. Opponent deck for tests: [hand trap + 39 Dark Magician].
- Hand traps live going 1st: Ash, Imperm (set), Veiler, Ogre, Droll. Fuwalos is dead going 1st.
- Heap snapshot/restore (`S()`/`R()` in beam.mjs) is what makes backtracking cheap; keep search states small.
