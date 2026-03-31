"use strict";

import * as vscode from "vscode";
import * as fs from "fs";
import * as paths from "path";
import { PSFileSync, PowerSchoolSyncConfig } from "./file-sync";

export class PowerSchoolSyncExtension {
  private _context: vscode.ExtensionContext;
  private _configFiles: { [key: string]: PowerSchoolSyncConfig } = {};
  private _sbSyncAll: vscode.StatusBarItem;
  private _fsw: vscode.FileSystemWatcher | undefined;
  private _outChan: vscode.OutputChannel;
  private _active = false;

  constructor(context: vscode.ExtensionContext) {
    this._context = context;

    this._outChan = vscode.window.createOutputChannel("FileSync Output");
    context.subscriptions.push(this._outChan);

    context.subscriptions.push(vscode.commands.registerCommand("psfilesync.createConfigFile", this._onCreateConfigFile, this));
    context.subscriptions.push(vscode.commands.registerCommand("psfilesync.startAllSyncs", this._startWatchers, this));
    context.subscriptions.push(vscode.commands.registerCommand("psfilesync.stopAllSyncs", this.stopFileSyncs, this));
    context.subscriptions.push(vscode.commands.registerCommand("psfilesync.syncCurrentFile", this._syncCurrentFile, this));
    context.subscriptions.push(vscode.commands.registerCommand("psfilesync.syncAllFiles", this._syncAllFiles, this));

    this._sbSyncAll = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    this._sbSyncAll.text = `$(sync) PSF Sync All`;
    this._sbSyncAll.tooltip = "Copy all files matching fsconfig.json";
    this._sbSyncAll.command = "psfilesync.syncAllFiles";
    context.subscriptions.push(this._sbSyncAll);

    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => this._initFromWorkspaceRoots()));

    this._initFromWorkspaceRoots();
  }

  private _syncCurrentFile(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this._log("⚠️ sync", "no active file", "open a file first");
      return;
    }

    const filePath = editor.document.uri.fsPath;

    for (const cfgPath in this._configFiles) {
      const cfgFile = this._configFiles[cfgPath];
      for (const config of cfgFile.configs) {
        if (!config.fsync) { continue; }
        const syncs = config.sync instanceof Array ? config.sync : [config.sync];
        for (const sync of syncs) {
          const srcNorm = paths.normalize(sync.src);
          const fileNorm = paths.normalize(filePath);
          if (fileNorm.startsWith(srcNorm)) {
            this._log("🖱️ manual", "sync current file", PSFileSync.fmtPath(filePath));
            config.fsync.syncItem(paths.relative(srcNorm, fileNorm), sync);
            return;
          }
        }
      }
    }

    this._log("⚠️ sync", "file not in any sync config", PSFileSync.fmtPath(filePath));
  }

  private _syncAllFiles(): void {
    this._log("🔄 sync all", "starting", "copying all files matching fsconfig.json...");
    let total = 0;
    for (const cfgPath in this._configFiles) {
      const cfgFile = this._configFiles[cfgPath];
      for (const config of cfgFile.configs) {
        if (!config.fsync || !config.enabled) { continue; }
        const syncs = config.sync instanceof Array ? config.sync : [config.sync];
        for (const sync of syncs) {
          const resolved = { ...sync };
          const cfgDir = (config as any).cfgFilePath || paths.dirname(cfgPath);
          if (!paths.isAbsolute(resolved.src)) { resolved.src = paths.resolve(cfgDir, resolved.src); }
          if (!paths.isAbsolute(resolved.dest)) { resolved.dest = paths.resolve(cfgDir, resolved.dest); }
          this._log("🔄 sync all", config.name, `${PSFileSync.fmtPath(resolved.src)} → ${PSFileSync.fmtPath(resolved.dest)}`);
          config.fsync.syncItem("", resolved);
          total++;
        }
      }
    }
    this._log("✅ sync all", "complete", `${total} sync path(s) processed`);
  }

  private _initFromWorkspaceRoots(): void {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) { return; }

    let found = false;
    for (const folder of folders) {
      const configPath = paths.join(folder.uri.fsPath, "fsconfig.json");
      if (fs.existsSync(configPath)) {
        found = true;
        this._loadConfigFile(configPath);
      }
    }

    if (found) { this._activate(); }
  }

  private _activate(): void {
    if (this._active) { return; }
    this._active = true;

    vscode.commands.executeCommand("setContext", "psfilesync.hasConfig", true);
    this._sbSyncAll.show();
    this._outChan.show(true);

    this._fsw = vscode.workspace.createFileSystemWatcher("**/fsconfig.json", false, false, false);
    this._fsw.onDidChange((e) => { if (this._isAtWorkspaceRoot(e.fsPath)) { this._loadConfigFile(e.fsPath); } });
    this._fsw.onDidCreate((e) => { if (this._isAtWorkspaceRoot(e.fsPath)) { this._loadConfigFile(e.fsPath); } });
    this._fsw.onDidDelete((e) => {
      if (this._isAtWorkspaceRoot(e.fsPath)) {
        this._log("🗑️ config", "deleted", PSFileSync.fmtPath(e.fsPath));
        delete this._configFiles[e.fsPath];
      }
    });
    this._context.subscriptions.push(this._fsw);
  }

  private _isAtWorkspaceRoot(filePath: string): boolean {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) { return false; }
    const dir = paths.dirname(filePath);
    return folders.some((f) => f.uri.fsPath === dir);
  }

  private _onCreateConfigFile(): void {
    if (!vscode.workspace.workspaceFolders) { return; }
    vscode.window.showWorkspaceFolderPick({ placeHolder: "Where to save fsconfig.json file" }).then((pick: any) => {
      if (pick?.uri?.fsPath) { PSFileSync.createDefaultConfigFile(pick.uri.fsPath); }
    });
  }

  private _startWatchers(): void {
    for (const cfgPath in this._configFiles) {
      const cfgFile = this._configFiles[cfgPath];
      for (const config of cfgFile.configs) {
        if (config.fsync) {
          this._log("▶️ sync", "starting watchers", config.name || cfgPath);
          config.fsync.startSyncs(config.sync);
        }
      }
    }
  }

  public stopFileSyncs = (): void => {
    for (const cfgPath in this._configFiles) {
      const cfgFile = this._configFiles[cfgPath];
      for (const config of cfgFile.configs) {
        if (config.fsync) {
          this._log("⏹️ sync", "stopping", config.name || cfgPath);
          config.fsync.stopSyncs(config.sync);
        }
      }
    }
  };

  private _loadConfigFile(filePath: string): void {
    const uri = vscode.Uri.file(filePath);
    this._log("📂 config", "loading", filePath);
    vscode.workspace.fs.readFile(uri).then(() => {
      delete this._configFiles[filePath];

      const cfgFile = (this._configFiles[filePath] = PSFileSync.loadConfigFile(filePath, false));
      let count = 0;
      for (const cfg of cfgFile.configs) {
        if (cfg.fsync) {
          cfg.fsync.on("fsync_log", this._log.bind(this));
          count++;
        }
      }
      this._log("✅ config", "loaded", `${count} sync config(s) from ${PSFileSync.fmtPath(filePath)}`);
    }, (err: any) => {
      this._log("❌ config", "failed to read", `${filePath} - ${err?.message || err}`);
    });
  }

  private _log(type: string, action: string, data: any): void {
    const logMsg = PSFileSync.fmtLogMessage(type, action, data);
    this._outChan.appendLine(`[${logMsg.date}] ${logMsg.msg}`);
  }
}
