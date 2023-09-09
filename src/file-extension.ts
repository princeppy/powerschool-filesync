"use strict";

import * as vscode from "vscode";
import { EventEmitter } from "events";
import * as paths from "path";
import { PSFileSync, PowerSchoolSyncConfig } from "./file-sync";

export class PowerSchoolSyncExtension extends EventEmitter {
  private _context: vscode.ExtensionContext;
  private _configFiles: { [key: string]: PowerSchoolSyncConfig };
  private _sbItem: vscode.StatusBarItem;
  private _fsw: vscode.FileSystemWatcher;
  private _outChan: vscode.OutputChannel;

  constructor(context: vscode.ExtensionContext) {
    super();

    this._context = context;
    this._configFiles = {};

    //keep an eye on various events.
    this.on("fsync", this._onFileSyncLog.bind(this));
    process.on("fsync_log", this._onFileSyncLog.bind(this));

    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(this._onWorkspaceFolderChange, this));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(this._onConfigChange, this));

    //start the outpus channel to show progress/status
    this._outChan = vscode.window.createOutputChannel("FileSync Output");
    this._outChan.show(true);
    context.subscriptions.push(this._outChan);

    //add command for creating default config file.
    context.subscriptions.push(vscode.commands.registerCommand("psfilesync.createConfigFile", this._onCreateConfigFile, this));
    context.subscriptions.push(vscode.commands.registerCommand("psfilesync.toggleSyncs", this.toggleFileSyncs, this));
    context.subscriptions.push(vscode.commands.registerCommand("psfilesync.startAllSyncs", this.startFileSyncs, this));
    context.subscriptions.push(vscode.commands.registerCommand("psfilesync.stopAllSyncs", this.stopFileSyncs, this));

    //create status bar item
    this._sbItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    this._sbItem.text = `FileSync`;
    context.subscriptions.push(this._sbItem);

    this._fsw = vscode.workspace.createFileSystemWatcher("**/fsconfig.json", false, false, false);
    this._fsw.onDidChange(this._onFileSystemChangeCreateEvent, this);
    this._fsw.onDidCreate(this._onFileSystemChangeCreateEvent, this);
    this._fsw.onDidDelete(this._onFileSystemDeleteEvent, this);
    context.subscriptions.push(this._fsw);

    //just force initial internal settings to be what's saved in the vscode config.
    this._onConfigChange();

    //get initial fsconfig.json files loaded.
    this._onWorkspaceFolderChange();
  }

  private _onWorkspaceFolderChange(): void {
    //reload fsconfig.json files when workspace/folder changes.
    vscode.workspace.findFiles("**/fsconfig.json").then((arConfigs) => {
      for (let i = 0; i < arConfigs.length; ++i) {
        this._loadConfigFile(arConfigs[i].fsPath);
      }
    });
  }

  private _onConfigChange(): void {
    let config = vscode.workspace.getConfiguration("filesync");
    this._onFileSyncLog("configChange", "update", config);
    config.showStatusBarInfo ? this._sbItem.show() : this._sbItem.hide();
  }

  private _onCreateConfigFile(): void {
    if (vscode.workspace.workspaceFolders) {
      vscode.window.showWorkspaceFolderPick({ placeHolder: "Where to save fsconfig.json file" }).then(
        function (pathInfo: any) {
          if (!pathInfo || !pathInfo?.uri.fsPath) {
            return;
          }
          let destPath = paths.join(pathInfo.uri.fsPath);

          PSFileSync.createDefaultConfigFile(destPath);
        }.bind(this)
      );
    }
  }

  public toggleFileSyncs(): void {
    var items: any[] = [];
    for (let key in this._configFiles) {
      let cfgFile = this._configFiles[key];
      cfgFile.configs.map((config) => {
        let syncs = config.sync instanceof Array ? config.sync : [config.sync];
        syncs.map((sync) => {
          items.push({
            label: `${config.name} - ${PSFileSync.fmtPath(sync.src)}`,
            picked: sync.active,
            sync: sync,
            config: config,
          });
        });
      });
    }

    vscode.window
      .showQuickPick(items, {
        canPickMany: true,
        ignoreFocusOut: true,
        matchOnDescription: true,
        matchOnDetail: true,
        placeHolder: "Select the FileSyncs you want to enable",
      })
      .then((selItems) => {
        //UI cancelled
        if (!selItems) {
          return;
        }

        //turn on/off the syncs.
        items.map((item) => {
          selItems.indexOf(item) != -1 ? item.config.fsync.startSyncs(item.sync) : item.config.fsync.stopSyncs(item.sync);
        });
      });
  }

  private _onFileSystemChangeCreateEvent = (event: any): void => this._loadConfigFile(event.fsPath);
  private _onFileSystemDeleteEvent = (event: any): void => this.stopFileSyncs(event.path);
  public startFileSyncs = (): void => this._startFileSyncs(true);
  public stopFileSyncs = (filePath?: string): void => this._startFileSyncs(false, filePath);

  private _startFileSyncs(start: boolean, filePath?: string): void {
    for (let cfgPath in this._configFiles) {
      if (filePath === undefined || cfgPath == filePath) {
        var cfgFile = this._configFiles[cfgPath];
        for (let i = 0; i < cfgFile.configs.length; ++i) {
          let fsync = cfgFile.configs[i].fsync;
          if (fsync) {
            start ? fsync.startSyncs(cfgFile.configs[i].sync) : fsync.stopSyncs(cfgFile.configs[i].sync);
          }
        }
      }
    }
  }

  private _loadConfigFile(filePath: string): void {
    let uri = vscode.Uri.file(filePath);
    vscode.workspace.fs.readFile(uri).then(() => {
      //kill existing filesync
      this._startFileSyncs(false, filePath);
      delete this._configFiles[filePath];

      //load the new file
      let cfgFile = (this._configFiles[filePath] = this._configFiles[filePath] || PSFileSync.loadConfigFile(filePath, true));
      for (let cfg in cfgFile.configs) {
        if (cfgFile.configs[cfg].fsync) {
          cfgFile.configs[cfg].fsync?.on("fsync_log", this._onFileSyncLog.bind(this));
        }
      }
    });
  }

  private _onFileSyncLog(type: string, action: string, data: any): void {
    let logMsg = PSFileSync.fmtLogMessage(type, action, data);
    let dateMsg = `[${logMsg.date}] ${logMsg.msg}`;
    this._outChan.appendLine(dateMsg);
    this._sbItem.text = `$(zap) FileSync: ${logMsg.msg}`;
    console.log(dateMsg);
  }
}
