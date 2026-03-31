# PowerSchoolFileSync - Developer Guide

## Prerequisites

- Node.js 16+
- VS Code 1.81.1+

## Setup

```bash
yarn install
```

## Compile

```bash
yarn compile
# or watch mode:
yarn watch
```

The `compile` script automatically cleans the `out/` folder before building.

## Package

```bash
npx -y @vscode/vsce package
```

This generates a `.vsix` file in the project root. Install it via `Extensions: Install from VSIX...` in the command palette.

## Debug

1. Press `F5` to open a new VS Code window with the extension loaded
2. Set breakpoints in `src/extension.ts` or `src/file-sync.ts`
3. View logs in the **FileSync Output** panel

## Project Structure

```text
src/
  extension.ts          -- Entry point: activate/deactivate lifecycle
  file-extension.ts     -- VS Code integration: commands, UI, config loading
  file-sync.ts          -- Core sync engine: file copy, watch, delete, retry
  fsconfig_default.json -- Template for new config files
```

## Architecture

### Activation Flow

1. VS Code checks `activationEvents: ["workspaceContains:fsconfig.json"]`
2. If no `fsconfig.json` at workspace root, extension does not activate
3. On activation, config is parsed but **no watchers are started**
4. User triggers sync manually (button click) or starts watchers via command

### Sync Modes

**Manual mode** (default):

- Click editor title button to sync one file
- Click status bar button to sync all files
- No `fs.watch()` handles, no background overhead

**Watcher mode** (opt-in via `Start all synchronizing` command):

- `fs.watch()` monitors source directories recursively
- File changes trigger automatic copy to destination
- Watchers are cleaned up on stop or deactivate

### File Copy Strategy

1. Check if source file is readable (`fs.openSync` with `"r"`)
2. Copy with `fs.copyFileSync`
3. On failure, retry up to 5 times with 200ms/400ms/600ms/800ms/1000ms backoff
4. Files are only copied when source `mtime` is newer than destination

## Go Further

- [VS Code UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/overview)
- [Bundling Extensions](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)
- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Continuous Integration](https://code.visualstudio.com/api/working-with-extensions/continuous-integration)
