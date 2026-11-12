# Roadmap

## ✅ v0.1: Foundations (this scaffold)
- Auto-detecting import: ydke://, .ydk, YGO Omega code, text recipe
- Card DB (YGOPRODeck) with IndexedDB cache; Main/Extra auto-split
- Tap-to-tag roles, with auto-tagging of common hand traps and board breakers
- Exact going-1st and going-2nd odds, with editable goal minimums
- Ratio suggestions (trades between flex roles; engine stays fixed)

## v0.2: Make it sticky
- Save decks and role tags locally; share a deck plus its tags as a URL
- Goal builder: add/remove patterns and rules, plus presets ("Resilient opener = Starter + Extender")
- Show the TCG banlist status on each card and warn about illegal counts
- Side-deck mode: pick which cards come out and which come in, then compare Game 1 vs post-side odds
- Mobile layout pass

## v0.3: Stage 2, combo lines (card level)
- Define combo lines from specific cards ("Card A + any of [B, C]")
- Cards with multiple roles (e.g. a starter that is also a hand trap)
- Draw and search effects: Pot of Prosperity (excavate 3/6), Pot of Desires, Upstart Goblin, searchers ("any of X counts as Y")
- Run the Monte Carlo in a Web Worker so the UI never freezes; show ± error
- Card-level optimiser: the right 40 given a card pool, using simulated annealing or a greedy search over copies

## v0.4: More import and export sources
- Konami Card Database / Neuron deck recipe links: needs a tiny serverless proxy because of CORS, plus scraping
- Master Duel (via the Konami DB deck export)
- YGOPRODeck deck page URLs
- Export as .ydk, Omega code, and an image of the decklist

## Open questions
- Should the app ship with community "role packs" per archetype, so tagging is automatic?
- Accounts and cloud saves, or keep everything local and shareable by URL?
