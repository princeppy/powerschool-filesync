# CLAUDE.md - PowerSchoolFileSync

## Project Overview

VS Code extension that copies files between source/destination directories based on `fsconfig.json`. Built for PowerSchool plugin development workflows where source files need to be deployed to a mounted server volume.

## Tech Stack

- TypeScript 5.9, VS Code Extension API 1.110, Node 22
- Package manager: `yarn`
- Bundler: `esbuild` (single-file bundle -> `dist/extension.js`)
- Type checking: `tsc --noEmit` (no code emission, esbuild handles transpilation)
- Linting: ESLint 9 with flat config (`eslint.config.mjs`)
- Build: `yarn compile` (type-check + lint + esbuild)
- Package: `npx -y @vscode/vsce package` (auto bumps patch version, cleans old .vsix)
- No runtime dependencies (all devDependencies)

## Architecture

Four source files in `src/`:

- `extension.ts` -- Entry point. Stores extension instance, calls `stopFileSyncs()` on deactivate.
- `file-extension.ts` -- VS Code integration layer. Registers commands, manages UI (editor title button, status bar, sidebar tree view), loads `fsconfig.json` from workspace roots only, delegates file operations to `PSFileSync`.
- `file-sync.ts` -- Core sync engine. Handles `fs.watch()` with debouncing (100ms), recursive directory walking, file copy with retry and copy locks, delete with retry limit, ignore patterns. Extends `EventEmitter` for logging via `fsync_log` events and state tracking via `fsync_state_change` events. Exports `ensureArray<T>()` utility used across all files.
- `sync-tree-provider.ts` -- Sidebar tree view. Implements `TreeDataProvider` showing sync configurations with status icons (green=watching, gray=stopped, red=error) and browsable file trees. Double-click a file to copy it immediately. Receives config state via getter function from `PowerSchoolSyncExtension`.

## Build System

esbuild bundles `src/extension.ts` (and all imports) into a single `dist/extension.js`. The `esbuild.js` script also copies `fsconfig_default.json` to `dist/` since it's loaded at runtime via `__dirname`.

- `yarn compile` -- type-check + lint + esbuild bundle
- `yarn watch` -- parallel esbuild watch + tsc watch
- `yarn package` -- production build (minified)
- `yarn check-types` -- tsc only
- `yarn lint` -- eslint only
- `npx -y @vscode/vsce package` -- clean old .vsix, bump version, build, package

## Key Design Decisions

- Extension only activates when `fsconfig.json` exists at workspace root (`workspaceContains:fsconfig.json`)
- No `fs.watch()` watchers start automatically -- user must explicitly start them via command
- Sync paths are resolved to absolute at config load time (not at watcher start), so manual sync works without starting watchers
- Watcher events bypass mtime check (`force=true`) since macOS `fs.watch` can fire before mtime updates on disk
- Watcher events are debounced (100ms) -- only the last event for the same file triggers a copy
- Copy lock prevents overlapping copies of the same file during retry backoff
- Destination volume reachability is checked before starting watchers (checks parent of dest path)
- Tree view refreshes are debounced (300ms) to batch rapid state changes; user-initiated refresh is immediate
- All timers, watchers, and locks are cleared on deactivate for instant VS Code shutdown
- Non-file editors (Output panel) are skipped when syncing current file
- All logs show relative paths with parent folder prefix for readability

## Commands

| Command ID | What it does |
|---|---|
| `psfilesync.createConfigFile` | Creates default `fsconfig.json` in chosen workspace folder |
| `psfilesync.startAllSyncs` | Starts `fs.watch()` watchers for all configured sync paths |
| `psfilesync.stopAllSyncs` | Closes all `fs.watch()` handles, clears timers and locks |
| `psfilesync.syncCurrentFile` | Copies the focused editor file to its destination (no watcher) |
| `psfilesync.syncAllFiles` | Recursively copies all files matching config (no watcher) |
| `psfilesync.refreshTree` | Reloads configs and refreshes the sidebar tree view |
| `psfilesync.syncTreeFile` | Copies a file clicked in the sidebar tree (internal, triggered by double-click) |

## UI Components

- **Activity bar sidebar** -- "PowerSchool File Sync" with sync icon, shows config tree with status indicators and browsable file trees
- **Editor title button** -- cloud-upload icon on active editor (when `psfilesync.hasConfig`)
- **Status bar button** -- "PSF Sync All" on the left side
- **Tree view context menu** -- Start/Stop watchers, Sync All on config entries

## Testing Workflow

No automated tests currently. Manual testing:

1. Compile: `yarn compile`
2. Package: `npx -y @vscode/vsce package`
3. Install `.vsix` in VS Code
4. Test in workspace WITH `fsconfig.json` -- sidebar tree, buttons, and sync should work
5. Test in workspace WITHOUT `fsconfig.json` -- extension should be completely dormant
6. Test Start/Stop watchers -- tree icons should change green/gray
7. Test double-click file in tree -- should copy regardless of watcher state
8. Test VS Code close -- should be instant, no "Stopping Extension Hosts" delay
9. Test with unreachable destination -- should log error, not crash

## Common Pitfalls

- `fs.watch()` is unreliable on macOS -- can drop events or fire duplicates. This is why debouncing and manual sync mode exist.
- The `fsconfig.json` watcher uses VS Code's `FileSystemWatcher` (reliable), not Node's `fs.watch()`.
- Source directory watchers (`startAllSyncs`) use Node's `fs.watch()` with `{ recursive: true }`.
- `PSFileSync` extends `EventEmitter` for logging -- the extension layer listens to `fsync_log` events.
- Paths in `fsconfig.json` can be relative (resolved at config load time) or absolute.
- `fsconfig_default.json` must be copied to `dist/` during build (handled by `esbuild.js`) since esbuild can't bundle files loaded via `fs.readFileSync` at runtime.
- `deleteItem` has a retry limit of 3 for ENOTEMPTY to prevent infinite recursion.
- The `ensureArray()` utility in `file-sync.ts` is used across all source files -- import it from there.
