# Knowledge base (Galaxy-Eyes pack)

Plain JSON, in git, readable and diffable. The app reads it; your corrections write to it. Nothing here is code.

| File | What it holds | Who writes it |
|---|---|---|
| `../lines.json` | Hand classes for the odds: which cards make a line, its board value, Nibiru-proof or not. Lower bounds the engine reproduced. | A developer, after the engine reproduces a line |
| `lines/<id>.json` | A stored line: the exact way a hand class is played. | `node sim/tools/kb-build.mjs` (from your replays), and the drill review ("my line is right") |
| `roles.json` | Card name to roles (Starter, Extender, Brick, Hand Trap, Board Breaker, Combo piece), as confirmed by you. | The role chips under the card text |
| `rulings.json` | Where YGO Omega and EDOPro disagree. EDOPro's scripts are the authority. | By hand, when a replay step fails |
| `cases/<id>.json` | Every "That's wrong" report and every drill answer to "why?", with the full duel state. These are the regression cases. | The "That's wrong" button and the drill review |

## A stored line (`lines/<id>.json`)
```json
{
  "id": "orbital-7",
  "class": "Orbital 7",            // the name of the hand class in ../lines.json this line plays
  "source": "replay 2-orb7-r1.txt", // or "user" for a line you promoted in a drill review
  "legal": true,                    // false = only reproduces with a wrong Omega ruling; shown, never expected
  "board": 4.25, "nib": true,       // what the line ends on (several numbers, never one score)
  "steps": [{ "k": "activate", "name": "Galaxy Defense Robot Orbital 7" }, { "k": "summon", "name": "..." }],
  "log": { "config": {}, "responses": [] }  // optional: the action log, so the line can be replayed exactly
}
```
`steps` is every summon and activation in order. A drill compares your steps with these and asks "why?" only where you left them.
When several lines exist for one class, the newest `"source": "user"` line wins: that is how a correction changes what the next drill expects.

## A case (`cases/<id>.json`)
```json
{ "id": "...", "created": 0, "kind": "ruling | line | role | deviation | other", "text": "what is wrong, in your words",
  "hand": ["..."], "class": "Orbital 7", "at": { "turn": 1, "decisions": 12 }, "log": { } }
```
`log` is the save state (ordered decks + seed + every response), so the exact position can be loaded again.
