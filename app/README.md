# YGO Ratio Optimiser

A web app that shows how often your Yu-Gi-Oh! deck opens well, going first (5 cards) and going second (6 cards), and suggests better ratios. It's built for the TCG format.

**The flow is three steps: paste a deck, tap roles, read the odds.**

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # importers, exact engine vs brute force, Galaxy list end to end
npm run build      # static site in dist/ (deploy to Vercel/Netlify/GitHub Pages)
```

## Import formats

Paste anything. The format is detected automatically, so you never have to choose one.

| Source | Format | Notes |
|---|---|---|
| EDOPro, YGOPRODeck | `ydke://main!extra!side!` | base64 of little-endian uint32 passcodes |
| EDOPro, YGO Omega, YGOPro | `.ydk` file (drop or pick) | `#main` / `#extra` / `!side` sections |
| YGO Omega | Omega deck code | base64(raw-deflate([u8 main+extra][u8 side][u32le…])). Main and Extra are stored together, so they are split using card types from the DB |
| Any decklist / recipe | `3 Ash Blossom`, `3x …`, `… x3` | Optional `Main:` / `Extra:` / `Side:` headers; Extra Deck cards are auto-sorted |

The app can also export decks as `ydke://` (more export formats are easy to add: `toYdk`, `toOmega` already exist).

## How it models a deck

Each card gets one or more **roles** (Starter, Extender, Combo piece, Hand Trap, Board Breaker) plus flags (**Dead if drawn**, **Never cut**, optimiser cap). From that the app builds **lines**:

- A **Starter** becomes a line: itself in hand + what it **needs** (e.g. Galaxy Soldier: another LIGHT monster) + every **Combo piece** that starter uses.
- Each requirement says where the card must be: **in hand**, **in the Deck** (Photon Emperor — drawing it breaks the line), or **anywhere in the 40** (Eternal Galaxy — only cutting every copy breaks the line).
- A Starter that **fetches** (Galaxy Wizard, Seventh Tachyon) counts through what it fetches; fetchers can have a cost (discard) or put a card back on top of the Deck. Pot of Prosperity/Duality are built in.
- Going 1st (5 cards): some line is live, with at most N dead cards. Going 2nd (6 cards): a line plus a hand trap / board breaker, or two of them.

Odds are exact (`src/lib/combo/engine.ts`): cards that behave identically are merged into classes, every hand over the classes is enumerated, and success is checked with distinct copies per requirement. `tests/reference.ts` is an independent brute-force dealer that the engine is checked against (exhaustively on small decks, by sampling on the Galaxy list).

The optimiser (`optimise.ts`) tries every −1/+1 (Side Deck included) and the best swaps, plus the best cuts down to 40, reporting ties as "equal for your goals".

`GALAXY_PRESET` in `src/lib/combo/setup.ts` is the Galaxy list written from two combo guides and the card texts — every note is tagged with its source.

## Layout

```
src/
  lib/deck/      ydk.ts  ydke.ts  omega.ts  nameList.ts  detect.ts   ← pure parsers, no network
  lib/cards/     ygoprodeck.ts (card DB, cached in IndexedDB)  resolve.ts (importDeck)
  lib/combo/     engine.ts  filters.ts  setup.ts  optimise.ts   ← the model (card-level, exact)
  lib/odds/      hypergeo.ts  optimise.ts                      ← the old role-count maths (kept, tested)
  lib/sim/       simulate.ts
  lib/roles.ts   roles, colours, default goals, auto-tag lists
  App.tsx        the UI
tests/           vitest
docs/ROADMAP.md
```

## Data source

Card data comes from the free [YGOPRODeck API](https://ygoprodeck.com/api-guide/). The slimmed card DB is downloaded once and cached locally for 3 days. Before going public, cache card images on your own host rather than hotlinking them, as their guide asks.
