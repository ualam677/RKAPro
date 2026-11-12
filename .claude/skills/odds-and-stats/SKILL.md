---
name: odds-and-stats
description: How the exact odds model and the community-style calculator work, which metrics to report, and what is verified. Load before touching sim/tools/odds.mjs, adding a line, or answering ratio questions.
---
- `sim/tools/odds.mjs` enumerates every distinct hand with its exact hypergeometric probability (hand traps grouped), maps each to its best engine-verified line (`evalHand`), and reports separate metrics: full board, Nibiru-proof, full + k hand traps, brick; going 2nd: P(at least 2/3 hand traps), combo + 2 HT. Never collapse these to one score.
- Board value is roughly interruptions: Photon Lord 1.25, Harbinger 1, Howling 1 (needs 3 materials + another Xyz; floor(materials/3) uses, each needing another Xyz), Transmigration 1, Eternal Galaxy 1, Photon Blast 0.5. A "full board" is at least 3.25.
- Nibiru-proof (user's definition): on summon 5, Photon Lord on field, or Tachyon Dragon on field so Transmigration is live; forcing Nibiru on summon 5 because summon 6 builds a negate also counts.
- Every `evalHand` line is a verified lower bound. Add a line only after the engine reproduces it (tools/scripted.mjs or a replay). Unmodelled hands (Wizard-only, Prosperity digs, odd pairs) are the main error source; check with tools/brickcheck.mjs.
- Swap costs on the current 43: starter to hand trap is about -1.5% full boards, -3% Nibiru-proof, +4% full+2HT, +4% going-2nd 2+HT.
- Keep 1 Wizard + 1 Thrasher; Fuwalos stays at 3 (user decision).
- Community-tool features to mirror in the quick calculator: NS flag (two Normal-Summon starters = one layer), non-OPT flag, 2-card combo pairs, deck-size and hand-size sweeps, exact hand-shape odds, .ydk tag import.
