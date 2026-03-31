# PowerSchoolFileSync

A lightweight VS Code extension that copies files between source and destination directories based on a `fsconfig.json` configuration file. Originally forked from [filesync-vsce](https://github.com/pgmjah/filesync-vsce) and rebuilt for PowerSchool development workflows.

## How It Works

1. Place a `fsconfig.json` file at your workspace root
2. The extension loads on startup (only if `fsconfig.json` exists)
3. Use the **editor title button** or **status bar button** to sync files manually
4. Optionally start `fs.watch()` watchers for automatic sync on file changes

The extension stays **completely dormant** in workspaces without `fsconfig.json` -- zero overhead.

## Features

| Feature            | Description                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Manual file sync   | Click the cloud-upload button in the editor title bar to copy the currently focused file |
| Sync all files     | Click `$(sync) PSF Sync All` in the status bar to copy every file matching config        |
| Auto-watch mode    | Start `fs.watch()` watchers via command palette for automatic sync on changes            |
| Ignore patterns    | Regex-based ignore patterns to skip files/directories                                    |
| Bidirectional sync | Optionally remove files from destination that don't exist in source                      |
| File filtering     | Sync only specific files listed in the `files` array                                     |
| Retry on lock      | Files locked by other processes are retried with exponential backoff (5 attempts)        |

## Commands

Open the command palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

| Command                                                  | Description                                                       |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| `PS FileSync: Create a fsconfig.json file`               | Generate a default config in the workspace folder you choose      |
| `PS FileSync: Start all synchronizing files/directories` | Start `fs.watch()` watchers -- auto-copies files when they change |
| `PS FileSync: Stop all synchronizing files/directories`  | Stop all active watchers                                          |
| `PS FileSync: Sync Current File`                         | Copy the currently focused file to its destination                |
| `PS FileSync: Sync All Files`                            | Recursively copy all files matching the config                    |

## UI Elements

- **Editor title button** (`$(cloud-upload)`) -- appears when `fsconfig.json` is present. Copies the active file.
- **Status bar button** (`$(sync) PSF Sync All`) -- appears in the bottom-left. Copies all matching files.

## fsconfig.json

Place this file at the root of your workspace. The extension only looks at the workspace root, not subdirectories.

### Example

```json
{
  "configs": [
    {
      "name": "MAI-ManageBacSync",
      "enabled": true,
      "sync": [
        {
          "src": "./Plugin/MAI-ManageBacSync/src/WEB_ROOT/admin",
          "dest": "/Volumes/PowerSchoolCustomWebRoot$/admin",
          "files": [],
          "ignore": ["(^(.*/)?~.*$)|((.*/)?[.]DS_Store$)"],
          "bidir": false
        }
      ]
    }
  ]
}
```

### Config Reference

| Field                     | Type     | Required | Description                                                                 |
| ------------------------- | -------- | -------- | --------------------------------------------------------------------------- |
| `configs`                 | array    | Yes      | Array of sync configuration blocks                                          |
| `configs[].name`          | string   | Yes      | Identifier for the config block (shown in logs)                             |
| `configs[].enabled`       | boolean  | Yes      | `true` to activate, `false` to skip                                         |
| `configs[].sync`          | array    | Yes      | Array of source/destination sync pairs                                      |
| `configs[].sync[].src`    | string   | Yes      | Source directory path (absolute or relative to `fsconfig.json`)             |
| `configs[].sync[].dest`   | string   | Yes      | Destination directory path (absolute or relative to `fsconfig.json`)        |
| `configs[].sync[].files`  | string[] | No       | Only sync these specific files (relative to `src`). Empty array = sync all. |
| `configs[].sync[].ignore` | string[] | No       | Regex patterns for files/directories to ignore                              |
| `configs[].sync[].bidir`  | boolean  | No       | If `true`, delete files from `dest` that don't exist in `src`               |

### Path Resolution

- Paths in `src` and `dest` can be **absolute** (`/Volumes/...`) or **relative** (`./Plugin/...`)
- Relative paths are resolved from the directory containing `fsconfig.json`
- Multiple `configs` blocks and multiple `sync` entries per config are supported

### Ignore Patterns

Ignore values are **JavaScript regex patterns** tested against the relative path:

```json
"ignore": [
  "(^(.*/)?~.*$)",
  "(.*/)?[.]DS_Store$",
  "node_modules"
]
```

Files matching `.git` are always ignored automatically.

## Log Output

All activity is logged to the **FileSync Output** panel (`View > Output > FileSync Output`):

```
[2026-03-31 00:15:42] ✅ file copy {"src":".../admin/mai/config.html","dest":".../admin/mai/config.html"}
[2026-03-31 00:15:42] ⏭️ file up to date {"file":".../admin/mai/styles.css"}
[2026-03-31 00:15:43] ❌ file copy failed after 5 retries {"src":"...","dest":"...","error":"EACCES"}
```

### Log Emoji Reference

| Emoji | Meaning                                          |
| ----- | ------------------------------------------------ |
| ✅    | Success                                          |
| ❌    | Failed                                           |
| ⏭️    | Skipped (up to date, ignored, not in files list) |
| 🖱️    | Manual sync triggered                            |
| 🔄    | Sync in progress                                 |
| 📂    | Config loading                                   |
| 📁    | Directory created                                |
| 🗑️    | Deleted                                          |
| ⚠️    | Warning                                          |
| 👁️    | File change detected (watcher mode)              |
| ▶️    | Watchers starting                                |
| ⏹️    | Watchers stopping                                |
| 🛑    | Stopped                                          |

## Release Notes

### 2.2.x

- Rebuilt activation: only activates when `fsconfig.json` exists at workspace root
- Manual sync mode: editor title button + status bar button
- Optional watcher mode via command palette
- Non-blocking async retry (replaced 5000-spin busy-wait loop)
- Detailed emoji logging to Output panel
- Clean deactivation: all `fs.watch()` handles properly closed
- Config only loaded from workspace root (not recursive search)

### 2.0.1

- Forked from [filesync-vsce](https://github.com/pgmjah/filesync-vsce)
- Removed git clone and file rename features
- Trimmed to sync-only functionality

## License

See [LICENSE.txt](LICENSE.txt)
