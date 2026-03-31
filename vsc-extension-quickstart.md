# PowerSchoolFileSync - Developer Guide

## Project Structure

```
src/
  extension.ts              Entry point (activate/deactivate)
  file-extension.ts         VS Code integration, commands, UI
  file-sync.ts              Core sync engine, watchers, file copy
  sync-tree-provider.ts     Sidebar tree view
  fsconfig_default.json     Default config template
images/
  icon.png                  Extension icon
  sidebar-icon.svg          Activity bar icon (monochrome SVG)
dist/
  extension.js              Bundled output (esbuild)
  fsconfig_default.json     Copied at build time
esbuild.js                 Build script
eslint.config.mjs          ESLint 9 flat config
tsconfig.json              TypeScript config (noEmit, type-check only)
package.json               Extension manifest
```

## Setup

```bash
yarn install
```

## Build Commands

```bash
yarn compile        # Type-check + lint + esbuild bundle
yarn watch          # Parallel esbuild watch + tsc watch (for development)
yarn check-types    # TypeScript type-check only
yarn lint           # ESLint only
yarn package        # Production build (minified)
```

## Debug

1. Open this project in VS Code
2. Press **F5** to launch the Extension Development Host
3. The `launch.json` opens a test workspace at `/Volumes/Projects/PowerSchool/Plugins/demo`
4. Set breakpoints in `src/*.ts` -- source maps are enabled in dev builds

The watch task (`yarn watch`) runs automatically as the default build task.

## Package

```bash
npx -y @vscode/vsce package
```

This automatically:
1. Removes old `.vsix` files
2. Bumps the patch version
3. Runs production build (type-check + lint + minified esbuild)
4. Produces `powerschoolfilesync-X.Y.Z.vsix`

## Install

```bash
code --install-extension powerschoolfilesync-X.Y.Z.vsix
```

Or in VS Code: Extensions > `...` menu > Install from VSIX.

## Architecture Notes

- **esbuild** bundles all TypeScript into a single `dist/extension.js`. The `tsc` compiler is only used for type checking (`--noEmit`).
- **`fsconfig_default.json`** is loaded at runtime via `fs.readFileSync(__dirname + '/fsconfig_default.json')`, so `esbuild.js` copies it to `dist/` during build.
- **`ensureArray<T>()`** utility in `file-sync.ts` is shared across all source files.
- **Tree refresh** is debounced (300ms) to batch rapid state changes from watchers.
- **Watcher events** are debounced (100ms) per file to handle macOS `fs.watch` duplicates.
