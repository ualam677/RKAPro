# RKAPro

**A custom EDOPro-core client built for deck testing**, with YGO Omega and Discord integration. It plays like a duel client, but its job is to make the user (and their testing partners) better at their deck: it knows the deck, runs the odds, drills hands, learns lines, and shares results.

This is the product name. The repo is still called `ygo-lab` until it is renamed on GitHub. All earlier docs ("the sim", "the app") mean RKAPro.

## Pillars
1. **Duel client** on the real EDOPro core (ocgcore + community scripts): play, undo, branch, save states, replay takeover.
2. **Deck lab**: exact odds, community-style quick calculator, ratio what-ifs, per-card marginal value, hand-trap and Nibiru stats (see DESIGN.md).
3. **Coach**: drill mode, best-line vs. your line, worst-case hand-trap windows, play-through suggestions (baits).
4. **Learning knowledge base**: lines, card roles, rulings, corrections, regression cases; new-card pipeline (see ARCHITECTURE.md).
5. **Video and sharing**: replay to mp4/GIF with captions.
6. **Omega bridge** and **Discord bridge** (below).

## YGO Omega integration (files and codes only; Omega is closed source)
- Import: Omega replay exports and Omega/ydke/ydk deck codes (done in the app/ importer and the follower).
- **Replay folder watcher**: point RKAPro at the folder where Omega saves replays/exports; new replays are parsed automatically, replayed in the engine, diffed against the knowledge base, and any new line, illegal play or ruling difference is flagged.
- Export: decks and lines back to Omega-compatible deck codes.
- **Ruling diff report**: where Omega allows something EDOPro's scripts forbid (e.g. Antimatter on turn 1), logged in `rulings/` and shown to the user.
- Replay takeover: load any Omega replay, scrub to a step, continue yourself.

## Discord integration
- **Rich Presence**: show "drilling Galaxy-Eyes / testing vs. Ash", current mode and hand count.
- **Share to a channel** (webhook, no bot hosting): odds table, drill result, line card, replay clip/GIF. Size limits apply, so clips are short and GIFs compressed.
- **Bot commands** (optional, later): `/odds`, `/line <starter>`, `/drill`, team leaderboard of drill accuracy.
- **Testing partners**: invite link into a duel or drill session; shared knowledge base for a team (lines and roles synced through a private git repo, not a Discord upload).
- Sign-in with Discord (OAuth) only if online features need identity; the offline app needs no account.

## "And more" (candidates; the user picks)
- Opponent decks from the meta (import lists, load their end boards) and a going-2nd breakthrough search.
- Matchup lab: run your lines against several decks' interaction sets.
- Self-review: record your own games, mark where each one left the library's best line.
- Practice-partner mode: a scripted hand-trap opponent with a personality (always Ash the first search, hold Nibiru for summon 5...).
- Format and banlist tracker: new list or set drops produce an impact report on the deck.
- Tournament notes: per-opponent matchup log and side-plan templates (sideboarding stays parked until the main deck is understood).
- Plugin packs: other decks and tech cards as packs on the deck-agnostic core.

## Decisions (user, 12 Nov 2026, round 2)
- **EDOPro compatibility is a hard requirement**: same core, same card DB and scripts, same file formats. RKAPro reads and writes EDOPro's deck (.ydk), replay (.yrpX) and expansion folders directly; several installs can be registered and decks moved between them.
- **Deck-agnostic from day one.** The core client, odds, save states, replay takeover and drills work for any deck. Deck-specific knowledge (roles, lines, board scoring, hand classes) lives in packs (`packs/<deck>`); Galaxy-Eyes is the first full pack. New decks start with auto-derived card roles and the learning loop builds the pack.
- **Practice partner has modes**: (1) scripted (e.g. Ash on the first search, Nibiru on summon 5), (2) smart (picks hand-trap timing to do the most damage, via minimax over the opponent's windows), (3) random, (4) user-defined scripts.
- **UI**: EDOPro's layout and speed (same prompts, hotkeys, auto-chain, animations off or fast), modernised. Own UI, not embedded EDOPro.
- **Teaching the app**: mechanics come from the card scripts and text (no explaining needed). The user only teaches *roles and judgement*: right-click a card to tag its role, type notes into the duel chat (attached to the current state), "that's wrong" button, and a post-duel review that asks "why?" only where the user left the library line.
- **Duel**: plays exactly like EDOPro. Save states (quick save/load, branch tree). The chat panel carries the important info: hand-trap and Nibiru windows, line-library matches, dead-end warnings, odds of the current line.
- **Deck sync**: import/export between EDOPro installs; Google Drive sync by pointing the deck folder at a Drive-synced folder first (no API needed), real Drive API only if that is not enough.
- **First-release extras (user, round 3)**: personal results log (real brick and full-board rates vs. exact odds), deck version history (each edit saved with its odds change), opponent board library (import end boards from replays; "can I break this, and with what?"). Test-hand mode is not a separate feature: drawing and playing a hand is the base duel and drill flow. Line map, hide-the-hint mode and stream overlay are not committed; revisit later.

## Guardrails
- ocgcore and ProjectIgnis scripts are AGPL-3.0: a distributed RKAPro must be open under the same licence.
- Do not bundle card art (fetch to a local cache for personal use; check the image API terms).
- RKAPro is a testing tool: it does not connect to public EDOPro servers or modify the official client unless EDOPro's own rules allow it (check first).
- Omega is integrated only through its files and deck codes.
- Keep "Yu-Gi-Oh!" and Konami marks out of the product name and branding.

## Build order
1. Engine core as a library + golden replay tests (`scripts/verify.sh` is the gate).
2. Knowledge base format + deck pack for Galaxy-Eyes.
3. Odds + quick calculator + stats (headless first, then UI).
4. Duel UI + drill mode.
5. Omega folder watcher + ruling diff.
6. Replay-to-video.
7. Discord share (webhook) + presence, then bot and partner sessions.
8. New-card pipeline and "that's wrong" button (can start earlier; needed before sharing builds).
