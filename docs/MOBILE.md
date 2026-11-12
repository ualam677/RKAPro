# RKAPro on mobile

Status: planned as Wave 9. The cheap parts are enforced from Wave 0 (see ROADMAP "Constraints from day one").

## Approach: one web UI, three shells
- `packages/engine` (WASM core, no Node-only code) runs in a **web worker** on desktop and phone.
- `apps/web` is the responsive React UI. `apps/desktop` is the Electron shell (file system, Omega watcher, video). Mobile is the same UI as an installable **PWA**, or wrapped with Capacitor if store distribution or better file access is wanted.
- Storage adapters: files on desktop, IndexedDB on the phone. The synced folder (Drive or git) stays the source of truth, because browser storage on a phone can be cleared.

## What belongs on the phone
- Odds, quick calculator, stats and deck version history.
- Drill mode (tap-to-choose prompts), line review, personal results log.
- Playing a hand or a full duel, with touch controls.
- Receiving shared lines and clips from Discord links.

## What stays on the desktop
- The heavy searches (optimiser, bait search, breakthrough search) and video rendering. The desktop computes; the phone reads the results (lines, tables) after sync. This saves battery and memory.

## Optimising for mobile
- **Data size:** ship a per-deck bundle (cards and Lua scripts for the deck and the opponent sets in use), lazy-loaded and cached, not the whole database. Measure the real size before promising offline use.
- **Save states:** seed plus response log (tiny), not WASM heap dumps.
- **Search:** a lower beam width and a time budget on the phone; precomputed odds tables ship with the pack.
- **Rendering:** no animations by default, virtualised lists, images fetched on demand and cached (no bundled card art).
- **Workers:** engine and search off the UI thread so touch stays responsive.

## Touch UI
- Prompts become bottom sheets with large targets; long-press shows card text; landscape gives the full field, portrait gives hand plus a collapsible field.
- Gestures: swipe to undo, tap for default action, a single quick-save button, and the chat panel as a slide-over.
- One-hand drill mode: the hand at the bottom, options within thumb reach.

## Open risks
- AGPL licensing and app stores have reported friction; a PWA avoids store review altogether.
- iOS limits background work and may clear storage for sites that are not installed.
- The WASM core's memory and speed on low-end phones need measuring, so an early spike should check a full turn-1 search before committing to Wave 9.
