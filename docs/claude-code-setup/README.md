# Claude Code setup for this repo

These files are ready to install but are kept here (not in `.claude/`) so you decide what Claude Code loads.

```
mkdir -p .claude && cp -r docs/claude-code-setup/skills docs/claude-code-setup/agents .claude/
```
Then delete the "Engine facts and gotchas" section from `CLAUDE.md` (it now lives in the `engine-gotchas` skill and only loads when needed). Keep `CLAUDE.md` short: it is paid for on every turn.

Optional `.claude/settings.json` to stop permission prompts for the repo's own tools:
```json
{ "permissions": { "allow": ["Bash(node tools/*)", "Bash(node sim/tools/*)", "Bash(npx vitest run*)", "Bash(./scripts/verify.sh)", "Bash(git status*)", "Bash(git diff*)", "Bash(git log*)"] } }
```

## Token habits for this project
- `./scripts/verify.sh` replays all five lines and prints five lines. Prefer it to raw tool output.
- Send anything that prints a lot (odds tables, ht/bait runs) to the `line-verifier` subagent, which returns a table.
- `/context` shows what is using the window (CLAUDE.md, skills, MCP servers, agents); check it at the start of a new feature. `/clear` between unrelated tasks.
- Name exact files in prompts. Do not ask for "review the repo".
- Keep MCP servers to what the current task needs; each one adds tool definitions to every turn.
- Use Sonnet for routine edits and test runs, a stronger model (Fable/Opus) for design and search algorithms.

## Extensions worth adding (vet third-party code before installing)
- **Anthropic-published:** `typescript-lsp` (code intelligence for the TypeScript migration), `code-review` (multi-agent review of PRs).
- **Playwright MCP** (Microsoft) for driving and screenshotting the UI once the Electron shell exists; community Electron variants exist (`electron-playwright-mcp`, `electron-test-mcp`) but are third-party.
- **Superpowers** (community plugin) for TDD / debugging / subagent workflows, if you like that style.
- Not needed yet: a database MCP, GitHub MCP (the `gh` CLI covers it).
