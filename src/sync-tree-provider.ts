import * as vscode from "vscode";
import * as paths from "path";
import * as fs from "fs";
import { PowerSchoolSyncConfig, SyncConfig, PSFileSync, ensureArray } from "./file-sync";

export interface SyncFileData {
  srcPath: string;
  destPath: string;
}

export class SyncTreeItem extends vscode.TreeItem {
  children: SyncTreeItem[] | undefined;
  syncFileData?: SyncFileData;

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    contextValue: string,
    children?: SyncTreeItem[]
  ) {
    super(label, collapsibleState);
    this.contextValue = contextValue;
    this.children = children;
  }
}

export class SyncTreeProvider implements vscode.TreeDataProvider<SyncTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SyncTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private _getConfigFiles: () => { [key: string]: PowerSchoolSyncConfig }) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SyncTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SyncTreeItem): SyncTreeItem[] {
    if (!element) {
      return this._buildConfigEntries();
    }
    return element.children || [];
  }

  private _buildConfigEntries(): SyncTreeItem[] {
    const configFiles = this._getConfigFiles();
    const items: SyncTreeItem[] = [];

    for (const cfgPath in configFiles) {
      const cfgFile = configFiles[cfgPath];
      for (const config of cfgFile.configs) {
        if (!config.enabled) { continue; }

        const syncs = ensureArray(config.sync);
        const children = syncs.map((sync: SyncConfig) => this._buildSyncEntry(sync));

        const hasActiveWatcher = syncs.some((s: SyncConfig) => s._fsWatch);
        const hasError = syncs.some((s: SyncConfig) => s._error);

        const item = new SyncTreeItem(
          config.name || "Unnamed Config",
          vscode.TreeItemCollapsibleState.Expanded,
          "configEntry",
          children
        );

        if (hasError) {
          item.iconPath = new vscode.ThemeIcon("error", new vscode.ThemeColor("testing.iconFailed"));
          item.description = "error";
        } else if (hasActiveWatcher) {
          item.iconPath = new vscode.ThemeIcon("eye", new vscode.ThemeColor("testing.iconPassed"));
          item.description = "watching";
        } else {
          item.iconPath = new vscode.ThemeIcon("circle-outline");
          item.description = "stopped";
        }

        items.push(item);
      }
    }

    if (items.length === 0) {
      const empty = new SyncTreeItem(
        "No fsconfig.json found",
        vscode.TreeItemCollapsibleState.None,
        "empty"
      );
      empty.iconPath = new vscode.ThemeIcon("info");
      return [empty];
    }

    return items;
  }

  private _buildSyncEntry(sync: SyncConfig): SyncTreeItem {
    const srcBase = paths.basename(sync.src);
    const destBase = paths.basename(sync.dest);
    const fileTree = this._readDirTree(sync.src, sync);

    const item = new SyncTreeItem(
      `${srcBase} → ${destBase}`,
      fileTree.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
      "syncEntry",
      fileTree
    );
    item.tooltip = `${sync.src} → ${sync.dest}`;

    if (sync._error) {
      item.iconPath = new vscode.ThemeIcon("error", new vscode.ThemeColor("testing.iconFailed"));
      item.tooltip = `Error: ${sync._error}\n${sync.src} → ${sync.dest}`;
    } else if (sync._fsWatch) {
      item.iconPath = new vscode.ThemeIcon("eye", new vscode.ThemeColor("testing.iconPassed"));
    } else {
      item.iconPath = new vscode.ThemeIcon("circle-outline");
    }

    return item;
  }

  private _readDirTree(dirPath: string, sync: SyncConfig): SyncTreeItem[] {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const items: SyncTreeItem[] = [];

      // Sort: folders first, then files, alphabetically
      const sorted = entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) { return -1; }
        if (!a.isDirectory() && b.isDirectory()) { return 1; }
        return a.name.localeCompare(b.name);
      });

      for (const entry of sorted) {
        if (entry.name.startsWith(".")) { continue; }
        const fullPath = paths.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          const children = this._readDirTree(fullPath, sync);
          const folder = new SyncTreeItem(
            entry.name,
            children.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
            "folder",
            children
          );
          folder.iconPath = new vscode.ThemeIcon("folder");
          items.push(folder);
        } else {
          const relPath = paths.relative(sync.src, fullPath);
          const destPath = paths.join(sync.dest, relPath);

          const file = new SyncTreeItem(
            entry.name,
            vscode.TreeItemCollapsibleState.None,
            "file"
          );
          file.iconPath = new vscode.ThemeIcon("file");
          file.syncFileData = { srcPath: fullPath, destPath };
          file.command = {
            command: "psfilesync.syncTreeFile",
            title: "Sync File",
            arguments: [file]
          };
          items.push(file);
        }
      }

      return items;
    } catch {
      return [];
    }
  }
}
