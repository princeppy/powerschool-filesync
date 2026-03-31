"use strict";

import { EventEmitter } from "events";
import * as paths from "path";
import * as fs from "fs";

export interface PowerSchoolSyncConfig {
  configs: FileSyncConfig[];
}

export interface FileSyncConfig {
  name: string;
  enabled: boolean;
  sync: SyncConfig[];
  fsync?: PSFileSync | undefined;
}

export interface SyncConfig {
  src: string;
  dest: string;
  files: string[];
  ignore: string[];
  bidir: boolean;
  active: boolean | true;
}

export class PSFileSync extends EventEmitter {
  private _config: any;

  constructor(config: any) {
    super();
    this._config = { ...config };
  }

  start(): Promise<any> {
    let config = this._config;
    config.fs = this;

    //start the syncs.
    this.startSyncs(config.sync);
    return Promise.resolve(config);
  }

  startSyncs(syncs: any): void {
    syncs = syncs || this._config.sync;
    syncs = syncs instanceof Array ? syncs : [syncs];
    syncs.map((sync: any) => {
      sync = { files: [], ignore: ["^(.*/)?~.*$"], ...sync };
      if (sync._fsWatch) {
        this.emit("fsync_log", "⏭️ sync", "already watching", { src: PSFileSync.fmtPath(sync.src) });
        return;
      }

      let config = this._config;
      sync.src = paths.resolve(config.cfgFilePath, sync.src);
      sync.dest = paths.resolve(config.cfgFilePath, sync.dest);

      this.emit("fsync_log", "🔄 sync", "initial sync", { src: PSFileSync.fmtPath(sync.src), dest: PSFileSync.fmtPath(sync.dest) });
      //defer initial sync so it doesn't block the extension host
      setTimeout(() => this.syncItem("", sync), 0);
      try {
        sync._fsWatch = fs.watch(sync.src, { recursive: true });
        sync._fsWatch.on("change", (type: string, filename: string) => {
          if (!filename) {
            this.emit("fsync_log", "⚠️ watch", "null filename from fs.watch", { src: PSFileSync.fmtPath(sync.src), type });
            return;
          }
          this.emit("fsync_log", "👁️ watch", "change detected", { type, file: filename });
          this.syncItem(filename, sync);
        });
        sync._fsWatch.on("close", () => {
          this.emit("fsync_log", "🛑 sync", "watcher closed", { src: PSFileSync.fmtPath(sync.src) });
          delete sync._fsWatch;
        });
        sync._fsWatch.on("error", (err: any) => {
          this.emit("fsync_log", "❌ watch", "watcher error", { src: PSFileSync.fmtPath(sync.src), error: err?.message || err });
        });
        this.emit("fsync_log", "✅ sync", "watching started", { src: PSFileSync.fmtPath(sync.src), dest: PSFileSync.fmtPath(sync.dest) });
        sync.active = true;
      } catch (ex: any) {
        this.emit("fsync_log", "❌ sync", "failed to start watcher", { src: PSFileSync.fmtPath(sync.src), error: ex.message });
      }
    });
  }

  stopSyncs(syncs: any): void {
    syncs = syncs || this._config.sync;
    syncs = syncs instanceof Array ? syncs : [syncs];
    for (let key in syncs) {
      let sync = syncs[key];
      if (!sync._fsWatch) {
        this.emit("fsync_log", "⏭️ sync", "not watching (nothing to stop)", { src: PSFileSync.fmtPath(sync.src) });
        continue;
      }
      sync._fsWatch.close();
      delete sync._fsWatch;
      delete sync.active;
      this.emit("fsync_log", "🛑 sync", "stopped", { src: PSFileSync.fmtPath(sync.src) });
    }
  }

  createFolder(path: string): void {
    let dirs = path.replace(/\\/g, "/").split("/").reverse();
    let dir = "";

    while (dirs.length) {
      dir += `${dirs.pop()}/`;
      if (!PSFileSync.itemExists(dir)) {
        try {
          fs.mkdirSync(dir);
          this.emit("fsync_log", "📁 dir", "created", { src: PSFileSync.fmtPath(dir) });
        } catch (ex: any) {
          this.emit("fsync_log", "❌ dir", "create failed", { src: PSFileSync.fmtPath(dir), error: ex.message });
        }
      }
    }
  }

  syncItem(itemPath: string, sync: any) {
    itemPath = itemPath || "";
    //if ignored, just continue along our merry way!
    let ignoreDirs: string[] = [].concat(sync.ignore instanceof Array ? sync.ignore : [sync.ignore]);
    if (-1 !== itemPath.search(".git") || -1 !== ignoreDirs.indexOf(itemPath)) {
      this.emit("fsync_log", "⏭️ ignored", "git/exact match", { src: itemPath });
      return;
    }

    if (ignoreDirs.some((ignoreDir) => new RegExp(ignoreDir, "gm").test(itemPath))) {
      this.emit("fsync_log", "⏭️ ignored", "pattern match", { src: itemPath });
      return;
    }

    itemPath = paths.normalize(itemPath);
    let srcPath = paths.normalize(`${sync.src}/${itemPath}`);
    let destPath = paths.normalize(`${sync.dest}/${itemPath}`);
    let srcStat = PSFileSync.itemExists(srcPath);
    let destStat = PSFileSync.itemExists(destPath);

    //delete file if source doesn't exist anymore.
    if (!srcStat) {
      this.emit("fsync_log", "🗑️ delete", "source removed", { dest: PSFileSync.fmtPath(destPath) });
      this.deleteItem(destPath);
      return;
    }

    //copy/recurse items.
    if (srcStat.isDirectory()) {
      //folder doesn't exist, create it
      if (!destStat) {
        this.createFolder(destPath);
      }

      //recurse folders and sync
      fs.readdirSync(srcPath).forEach((file: string, index: number) => {
        this.syncItem(`${itemPath}${itemPath ? "/" : ""}${file}`, sync);
      });

      //clean out files in dest that aren't in src.
      if (sync.bidir) {
        fs.readdirSync(destPath).forEach((file: string, index: number) => {
          if (!PSFileSync.itemExists(`${srcPath}/${file}`)) {
            this.deleteItem(`${destPath}/${file}`);
          }
        });
      }
    } else {
      if (!destStat || srcStat.mtimeMs > destStat.mtimeMs) {
        //only sync specified files.
        if (itemPath && sync.files) {
          const syncItems = [].concat(sync.files instanceof Array ? sync.files : [sync.files]);
          if (syncItems.length && !syncItems.find((item: string) => paths.normalize(item) === itemPath)) {
            this.emit("fsync_log", "⏭️ skipped", "not in files list", { file: itemPath });
            return;
          }
        }

        //copy file — retry a few times if locked, with short delays to avoid blocking the event loop.
        this._copyFileWithRetry(srcPath, destPath);
      } else {
        this.emit("fsync_log", "⏭️ file", "up to date", { file: PSFileSync.fmtPath(srcPath) });
      }
    }
  }

  private _copyFileWithRetry(srcPath: string, destPath: string, maxRetries: number = 5, attempt: number = 0): void {
    try {
      let fd = fs.openSync(srcPath, "r");
      fs.closeSync(fd);
      fs.copyFileSync(srcPath, destPath);
      this.emit("fsync_log", "✅ file", "copy", { src: PSFileSync.fmtPath(srcPath), dest: PSFileSync.fmtPath(destPath) });
    } catch (ex: any) {
      if (attempt < maxRetries) {
        setTimeout(() => this._copyFileWithRetry(srcPath, destPath, maxRetries, attempt + 1), 200 * (attempt + 1));
      } else {
        this.emit("fsync_log", "❌ file", `copy failed after ${maxRetries} retries`, { src: PSFileSync.fmtPath(srcPath), dest: PSFileSync.fmtPath(destPath), error: ex?.message });
      }
    }
  }

  deleteItem(path: string) {
    if (PSFileSync.itemExists(path)) {
      let lstat = fs.lstatSync(path);
      if (lstat.isDirectory()) {
        fs.readdirSync(path).forEach((file: string, index: number) => {
          let curPath = path + "/" + file;
          this.deleteItem(curPath);
        });

        try {
          fs.rmdirSync(path);
          this.emit("fsync_log", "🗑️ dir", "deleted", { src: PSFileSync.fmtPath(path) });
        } catch (ex: any) {
          if (ex.code === "ENOTEMPTY") {
            this.emit("fsync_log", "⚠️ dir", "not empty, retrying delete", { src: PSFileSync.fmtPath(path) });
            this.deleteItem(path);
          } else {
            this.emit("fsync_log", "❌ dir", "delete failed", { src: PSFileSync.fmtPath(path), error: ex.message });
          }
        }
      } else {
        try {
          fs.unlinkSync(path);
          this.emit("fsync_log", "🗑️ file", "deleted", { src: PSFileSync.fmtPath(path) });
        } catch (ex: any) {
          this.emit("fsync_log", "❌ file", "delete failed", { src: PSFileSync.fmtPath(path), error: ex.message });
        }
      }
    }
  }
  static itemExists(path: string): fs.Stats | undefined {
    let ret: fs.Stats | undefined = undefined;
    try {
      ret = fs.statSync(path);
    } catch (ex) {
      ret = undefined;
    }
    return ret;
  }

  static fmtLogMessage(type: string, action: string, data: any): { msg: string; date: string; type: string; action: string; data: any } {
    let msg = `${type} ${action} ${data ? JSON.stringify(data) : ""}`;
    let date = new Date();
    let _date = `${PSFileSync._fmtDateVal(date.getFullYear())}-${PSFileSync._fmtDateVal(date.getMonth() + 1)}-${PSFileSync._fmtDateVal(date.getDate())} ${PSFileSync._fmtDateVal(date.getHours())}:${PSFileSync._fmtDateVal(
      date.getMinutes()
    )}:${PSFileSync._fmtDateVal(date.getSeconds())}`;
    return { msg, date: _date, type, action, data };
  }

  static fmtPath(strPath: string): string {
    let path = paths.parse(strPath);
    let dir = path.dir.split("/");
    let dirPrefix = dir.length > 6 ? dir.slice(0, 4).join("/") : null;
    let dirSuffix = dir.length > 6 ? dir.slice(dir.length - 3).join("/") : null;
    return dirPrefix && dirSuffix ? `${dirPrefix}/.../${dirSuffix}/${path.name}${path.ext}` : `${path.dir}/${path.name}${path.ext}`;
  }

  private static _fmtDateVal = (dateVal: number): string => (dateVal < 10 ? `0${dateVal}` : `${dateVal}`);

  static log(type: string, action: string, data: any | undefined = undefined): void {
    //not running standalone.
    if (module.require.main) {
      return;
    }
    let log = PSFileSync.fmtLogMessage(type, action, data);
    console.log(`[${log.date}] ${log.msg}`);
  }

  static loadConfigFile(filePath: string, startSyncing: boolean): any {
    var configFile = null;

    try {
      configFile = fs.readFileSync(filePath).toString();
      configFile = JSON.parse(configFile);
      configFile.filePath = filePath;

      for (let i = 0; i < configFile.configs.length; i++) {
        const config = configFile.configs[i];
        if (config && config.enabled) {
          config.cfgFilePath = paths.parse(configFile.filePath).dir;
          const fsync = (config.fsync = new PSFileSync(config));
          fsync.on("fsync_log", PSFileSync.log);
          if (startSyncing) {
            //defer start so it doesn't block the extension host during activation/reload
            setTimeout(() => fsync.start(), 100);
          }
        }
      }
    } catch (ex) {
      PSFileSync.log("initialize", "load config", ex);
      PSFileSync.log("INFO", "if no config.json file, make one with the 'mkdef' command.");
    }
    return configFile;
  }

  static createDefaultConfigFile(filePath: string, fileName?: string): void {
    fileName = fileName || "fsconfig.json";

    let desPath = paths.join(paths.resolve(filePath), fileName);
    if (fs.existsSync(desPath)) {
      PSFileSync.log("create default config file", "skipped", "'fsconfig.json' already exist");
      return;
    }

    let srcPath = paths.join(paths.parse(module.filename).dir, `fsconfig_default.json`);
    if (!fs.existsSync(srcPath)) {
      PSFileSync.log("create default config file", "failed", "default 'fsconfig.json' missing");
      return;
    }

    fs.copyFile(srcPath, desPath, fs.constants.COPYFILE_EXCL, function (err) {
      PSFileSync.log("create default config file", !!err ? "failed" : "success", err || undefined);
    });
  }
}
