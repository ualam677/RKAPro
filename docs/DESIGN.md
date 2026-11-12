# Product design (decided with the user, 12 Nov 2026)

Desktop app (Electron; the engine is already JS/WASM, no server). The user plays the duels themselves.
First three features, in this order of build: **drill mode, odds/stats, replay-to-video.** The new-card update flow ships alongside, because everything depends on fresh data.

## 1. Drill mode (play it yourself)
- Deal a random hand from the user's deck (going 1st or 2nd). Filters: only hands with a hand trap; only hands where the library line is non-obvious; hands the user previously got wrong (spaced repetition).
- The user plays the turn in a field/hand/chain UI over the engine. Opponent is scripted: pick hand traps (Ash, Imperm, Veiler, Ogre, Droll, Nibiru, Fuwalos going 2nd) and a firing policy (random window / worst window / none).
- After the turn: user's board vs. the library's best line vs. the worst-case hand-trap window, with the step where they diverged and why (card text shown). Save state at the divergence so they can retry from there.
- Tracked: accuracy by hand class, board vs. optimal, hand-trap windows missed, Nibiru-proof rate. These are the "stats for me".

## 2. Odds and stats (build on sim/tools/odds.mjs + what community tools do)
Layers, all fed from the same deck list:
1. **Engine-verified hand-class model (ours, already built):** every distinct hand → best verified line → board, Nibiru-proof, hand traps left. Separate numbers, never one score. Going 1st (5 cards) and 2nd (6 cards).
2. **Generic calculator layer (community-style, for quick questions):** tag-based hypergeometric (starter / 2-card combo pair / non-engine / brick), sweep over deck size 40..60 and hand size, exact "hand shape" odds, Monte Carlo cross-check. Tags can be auto-filled from the engine's verified classes instead of by hand.
3. **Conditional and marginal stats:** P(full board | k hand traps in hand), P(≥k hand traps going 2nd), value of one more/fewer copy of every card (delta table), least valuable card, Prosperity dig odds, "chance they hold Ash right now" from their list and cards seen.
4. **Copy the useful bits of community tools:** NS flag (two Normal-Summon starters count as one layer), non-OPT flag (two copies = two layers), 2-card combo pairs, deck-size sweep, .ydk tags import, engine / non-engine / brick tagging.
Community tools surveyed: YGOrg Combo Rate Calculator (Monte Carlo + exact hand-shape odds, user-tagged categories), ygeometric / yugioh.party (hypergeometric), mikekatica/ygo-deck-stats (Jupyter, engine / non-engine / brick tags), the user's old Yugioh-Deck-Analyzer 1.5. None run the real card scripts, so none know what a hand actually does; that is the gap this fills.

## 3. Replay to video (lightweight)
- Input: any parsed replay or drill session (event log from the engine).
- Render one frame per meaningful event (summon, activate, chain link, negate, material change) on a simple 2D board, with a caption: card name, effect text, and which hand trap window (if any) is live.
- Encode with ffmpeg (ffmpeg-static) to mp4 or GIF; options: speed, show chain, highlight hand-trap windows, hide hand.
- Card art: fetch per card from the public YGOPRODeck image API and cache locally for personal use (check their terms; do not bundle art in the repo, do not hotlink).

## 4. New cards and problems (data pipeline)
Update button: pull BabelCDB + CardScripts + banlist (and bump ocgcore-wasm if needed) → diff new/changed cards → regression-replay every verified line (flag the first differing step) → triage new cards that mention Photon/Galaxy, search or summon our cards, or look like hand traps/board breakers → draft role for the user to confirm. A card with no script is "not implemented" and any line using it is "unverified".
"That's wrong" button: save state + expected result → permanent regression test; engine bug vs. Omega/EDOPro ruling difference goes to a ruling-notes file.

## 5. Learning
Not a neural net. A growing library of verified lines, rules and card roles; the search reuses it; every user correction or replay adds to it and can be read and edited. Later: overnight self-search for lines that beat the library.
