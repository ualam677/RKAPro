# Progress log (read this first in every session)

**Current wave:** 0 (Foundation). **Next slice:** 0.2 workspace layout.

Repo state at last entry: sim/ headless engine and tools work (`scripts/verify.sh` passes all 5 replays); app/ ratio optimiser has 48 passing tests; no Electron, no duel UI yet.

## Log (newest first; 3 to 5 lines per slice)
- 12 Nov 2026, slice 0.5 done: `sim/deck.mjs` is the current list; replays keep their recorded list (`REPLAY_MAIN`), `NEWLIST=1` tries them on the current one.
  Current vs old: full 93.3 / 93.5, Nibiru-proof 85.4 / 83.8, full+2HT 41.3 / 41.4, brick 6.7 / 5.9, going-2nd ≥2HT 74.0 / 74.0. Table in NOTES.md.
  Surprise: S38 was Dragluxion's attach target in the Schwarzschild line; Number 62 does that job now (79/79, board 4). Side card 97045738 = Dominus Purge alt art.
  `odds.mjs` never ran on Windows (file:// check); fixed. 0.1 was already done (commit 750e881).
- 12 Nov 2026: user sent the current list; saved to `decks/` (code + decoded diff). `sim/deck.mjs` and all odds still use the old list: slice 0.5 fixes that. Replays still verify on their own lists.
- 12 Nov 2026: planning done (VISION, ARCHITECTURE, DESIGN, ROADMAP, MOBILE). No build slices yet.
