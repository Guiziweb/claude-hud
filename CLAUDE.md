# claude-hud

Statusline HUD plugin for Claude Code. Reads the statusline stdin JSON, prints one coloured line: context % + 5h/7d rate limits.

Runtime: Bun (version pinned in `.bun-version`). The repo is its own single-plugin marketplace (`.claude-plugin/marketplace.json`).

## Commands

```bash
bun install                       # setup
bun run ci                        # everything CI runs: check + typecheck + coverage + build
bun test                          # test suite
bun test tests/render.test.ts     # single file
bun test -t "clamps"              # filter by test name
bun run build                     # scripts/build.mjs (tsdown) → dist/
```

## Rules

- `dist/` is committed. After any `src/` change: `bun run build`, commit the result. CI fails if `dist/` is out of sync.
- 100% line coverage is enforced (`bunfig.toml`). Only `src/hud.ts` and `src/install-statusline.ts` are excluded.
- Conventional commits (`fix:`, `feat:`). release-please handles versions and tags (`vX.Y.Z`) — never bump by hand.
- No `Claude-Session` footer or other generated trailers in commit messages.

## Architecture

Pure core, thin I/O entries. New logic goes in a covered module with tests; entry points stay wiring-only.

Core modules (tested, 100% covered):

| Module | Role |
|---|---|
| `stdin-schema.ts` | Valibot schema, every field optional (upstream changes degrade, never crash) |
| `compute.ts` | percentages, clamping, reset-time formatting |
| `render.ts` | bars + line assembly |
| `colors.ts` | ANSI helpers + colour thresholds |
| `install.ts` | `decideInstall()`: install / update / skip-already-current / skip-existing-third-party |
| `autocompact-state.ts` | reads Claude Code config: auto-compact flag + token buffers |

Entry points (I/O glue, excluded from coverage):

| Entry | Role |
|---|---|
| `hud.ts` | stdin → render → stdout; invalid JSON prints an empty line, never crashes |
| `install-statusline.ts` | run by the `SessionStart` hook; edits `~/.claude/settings.json`, never overrides a third-party statusLine |

## History

Up to v0.2.2 the plugin lived in `Guiziweb/guiziweb-plugins` (`plugins/claude-hud/`); old changelog links point there.
