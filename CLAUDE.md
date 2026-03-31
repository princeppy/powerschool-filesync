# CLAUDE.md - PowerSchoolFileSync

## Project Overview

VS Code extension that copies files between source/destination directories based on `fsconfig.json`. Built for PowerSchool plugin development workflows where source files need to be deployed to a mounted server volume.

## Tech Stack

- TypeScript, VS Code Extension API
- Package manager: `yarn`
- Build: `yarn compile` (runs `tsc -p ./`)
- Package: `npx -y @vscode/vsce package`
- No runtime dependencies (all devDependencies)

## Architecture

Three source files in `src/`:

- `extension.ts` -- Entry point. Stores extension instance, calls `stopFileSyncs()` on deactivate.
- `file-extension.ts` -- VS Code integration layer. Registers commands, manages UI (editor title button, status bar), loads `fsconfig.json` from workspace roots only, delegates file operations to `PSFileSync`.
- `file-sync.ts` -- Core sync engine. Handles `fs.watch()`, recursive directory walking, file copy with retry, delete, ignore patterns. Extends `EventEmitter` for logging via `fsync_log` events.

## Key Design Decisions

- Extension only activates when `fsconfig.json` exists at workspace root (`workspaceContains:fsconfig.json`)
- No `fs.watch()` watchers start automatically -- user must explicitly start them via command
- Manual sync (editor title button, status bar button) works without any watchers
- File copy uses async retry with backoff (5 attempts, 200ms increments) instead of blocking loops
- Config is only loaded from workspace root, never recursively searched
- All logs go to the "FileSync Output" channel only (no `console.log` in production path)

## Commands

| Command ID | What it does |
|------------|-------------|
| `psfilesync.createConfigFile` | Creates default `fsconfig.json` in chosen workspace folder |
| `psfilesync.startAllSyncs` | Starts `fs.watch()` watchers for all configured sync paths |
| `psfilesync.stopAllSyncs` | Closes all `fs.watch()` handles |
| `psfilesync.syncCurrentFile` | Copies the focused editor file to its destination (no watcher) |
| `psfilesync.syncAllFiles` | Recursively copies all files matching config (no watcher) |

## Testing Workflow

No automated tests currently. Manual testing:

1. Compile: `yarn compile`
2. Package: `npx -y @vscode/vsce package`
3. Install `.vsix` in VS Code
4. Test in workspace WITH `fsconfig.json` -- buttons should appear, sync should work
5. Test in workspace WITHOUT `fsconfig.json` -- extension should be completely dormant
6. Test VS Code close -- should be instant, no "Stopping Extension Hosts" delay

## Common Pitfalls

- `fs.watch()` is unreliable on macOS -- can drop events or fire duplicates. This is why manual sync mode exists as the default.
- The `fsconfig.json` watcher uses VS Code's `FileSystemWatcher` (reliable), not Node's `fs.watch()`.
- Source directory watchers (`startAllSyncs`) use Node's `fs.watch()` with `{ recursive: true }`.
- `PSFileSync` extends `EventEmitter` for logging -- the extension layer listens to `fsync_log` events.
- Paths in `fsconfig.json` can be relative (resolved from config file directory) or absolute.
