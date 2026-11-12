# Architecture (top-down)

## One idea
Everything the app shows is **derived** from four versioned inputs: the **data version** (card DB + scripts + banlist), the **deck**, the **knowledge base** (verified lines, card roles, rulings, user corrections) and the **engine**. Derived results are cached by hash of those inputs, so stats are instant and never stale.

## Layers (each depends only on the one above it)
1. **Data**: ProjectIgnis BabelCDB, CardScripts, LFLists. Pinned to a commit per release. Update = new pin + automatic regression (see DESIGN.md section 4).
2. **Engine core** (library, no UI, deterministic): duel lifecycle on ocgcore-wasm; prompts to labelled options; event log; **save state = heap snapshot, or deck + seed + response prefix**; replay = response list. This is the only code that talks to ocgcore.
3. **Knowledge base** (plain JSON, in git, human-readable, diffable): `lines/` (entry, shared middle states, finish, with preconditions), `roles/` (card to starter / extender / brick / hand trap / board breaker, confirmed by the user), `rulings/` (EDOPro vs Omega differences), `cases/` (every "that's wrong" report as a regression test). A deck-agnostic core plus a **deck pack** (the Galaxy-Eyes pack: deck list, roles, lines, hand-trap model). Other decks and tech cards are other packs.
4. **Analysis services** (CPU-heavy, run in worker processes): odds (exact hand-class model + quick generic calculator), plan-guided search, hand-trap / Nibiru minimax, drill scorer, replay follower. All are pure functions of (deck, knowledge, data version).
5. **App shell** (Electron, thin): duel UI, drill mode, calculator, stats, video export. Talks to services through typed IPC and holds no game logic.

## Structural emphasis
- **Determinism and serialisable state.** Same deck + seed + responses = same game. Save states, replay takeover, regression tests and drills are then all one mechanism.
- **Knowledge is data, not code.** A correction from the user becomes a file change that is reviewed and tested, not a patch to a search heuristic.
- **EDOPro scripts are the ruling authority.** Omega differences are logged in `rulings/`, never silently followed.
- **Search results are lower bounds.** Plain beam search undercounts (see the engine-gotchas skill). The stats layer reports "verified at least X" and prefers library lines over search.
- **Cache by input hash;** invalidate only when the deck, knowledge or data version change.
- **Golden tests first.** The five user replays must reproduce exactly (Soldier only with Omega's ruling flag). Odds must sum to 1 and match Monte Carlo within tolerance.

## Easier calculator that learns from card inputs
1. User pastes or imports a deck, or types a card.
2. For every card the app tests it in the engine: alone with filler, with each known starter, with each known hand trap. Output: a proposed role (starter / needs Normal Summon / needs another LIGHT / extender / brick) with the evidence.
3. User confirms or corrects; the role is saved in the knowledge base. Next time that card is known.
4. Quick calculator: sliders (starters, hand traps, bricks, deck size, hand size) pre-filled from the roles, with the community-style outputs (at least one starter, brick, at least k hand traps, 2-card pairs, deck-size sweep). One click swaps in the exact engine-verified model.

## Workspace layout (as built in Wave 0; the block below was the plan)
Built: `packages/engine` (import-free core + API), `packs/galaxy-eyes`, `sim/` (Node host, search, tools), `app/` (the desktop app; not moved to `apps/desktop`). `packages/analysis` arrives with slice 1.1; knowledge lives in the pack until a second deck needs a shared package.

```
packages/engine/      engine core (TypeScript, migrate sim/*.mjs incrementally)
packages/knowledge/   schemas + loaders for lines, roles, rulings, cases
packages/analysis/    odds, search, hand-trap minimax, drill scoring
apps/desktop/         Electron shell (reuse app/ React components)
packs/galaxy-eyes/    deck, roles, lines
data/                 pinned card data (git-ignored; fetched by script)
```
