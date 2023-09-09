"use strict";

import { EventEmitter } from "events";
import * as paths from "path";
import * as util from "util";
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
      if (sync._fsWatch) {
        return;
      }

      let config = this._config;
      sync.src = paths.resolve(config.cfgFilePath, sync.src);
      sync.dest = paths.resolve(config.cfgFilePath, sync.dest);

      this.syncItem("", sync); //initial sync...will make sure the dest is there and up to date.
      try {
        sync._fsWatch = fs.watch(sync.src, { recursive: true });
        sync._fsWatch.on("change", (type: string, filename: string) => {
          this.syncItem(filename, sync);
        });
        sync._fsWatch.on("close", () => {
          this.emit("fsync_log", "filesync", "sync_closed", sync.src);
          delete sync._fsWatch;
        });
        this.emit("fsync_log", "filesync", "sync_watching", sync);
        sync.active = true;
      } catch (ex: any) {
        this.emit("fsync_log", "filesync", "not watching", ex.message);
      }
    });
  }

  stopSyncs(syncs: any): void {
    syncs = syncs || this._config.sync;
    syncs = syncs instanceof Array ? syncs : [syncs];
    for (let key in syncs) {
      let sync = syncs[key];
      if (!sync._fsWatch) {
        continue;
      }
      sync._fsWatch.close();
      delete sync.active;
    }
  }

  createFolder(path: string): void {
    let dirs = path.replace(/\\/g, "/").split("/").reverse();
    let dir = "";

    while (dirs.length) {
      dir += `${dirs.pop()}/`;
      if (!PSFileSync.itemExists(dir)) {
        fs.mkdirSync(dir);
        this.emit("fsync_log", "dir", "create", { src: dir });
      }
    }
  }

  syncItem(itemPath: string, sync: any) {
    itemPath = itemPath || "";
    //if ignored, just continue along our merry way!
    let ignoreDirs: string[] = [].concat(sync.ignore instanceof Array ? sync.ignore : [sync.ignore]);
    if (-1 !== itemPath.search(".git") || -1 !== ignoreDirs.indexOf(itemPath)) {
      return;
    }

    itemPath = paths.normalize(itemPath); //itemPath.replace(/\\/g, "/");
    let srcPath = paths.normalize(`${sync.src}/${itemPath}`);
    let destPath = paths.normalize(`${sync.dest}/${itemPath}`);
    let srcStat = PSFileSync.itemExists(srcPath);
    let destStat = PSFileSync.itemExists(destPath);

    //delete file if source doesn't exit anymore.
    if (!srcStat) {
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
        this.syncItem(`${itemPath}${itemPath ? "/" : ""}${file}`, sync); //pass relative path...outer will concat with srcPath
      });

      //clean out files in dest that aren't in src.
      if (sync.bidir) {
        fs.readdirSync(destPath).forEach((file: string, index: number) => {
          //use full paths...not recursing, just nuking!
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
            return;
          }
        }

        //big files can be locked while being copied/moved...so try a bunch of times to copy it...if fails, then just bail.
        let nTimes = 0;
        while (true) {
          try {
            let fd = fs.openSync(srcPath, "r+");
            fs.closeSync(fd);
            fs.copyFileSync(srcPath, destPath);
            this.emit("fsync_log", "file", "copy", { src: srcPath, dest: destPath });
            break;
          } catch (ex) {
            if (++nTimes > 5000) {
              this.emit("fsync_log", "file", "copy", { src: srcPath, dest: destPath, exception: ex });
              break;
            }
          }
        }
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
          this.emit("fsync_log", "dir", "delete", { src: path });
        } catch (ex: any) {
          if (ex.code === "ENOTEMPTY") {
            this.deleteItem(path);
          }
        }
      } else {
        fs.unlinkSync(path);
        this.emit("fsync_log", "file", "delete", { src: path });
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
    async function makeFileSyncs(configs: any[], idx: number, configFile: any): Promise<void> {
      let config = configs[idx];
      if (config && config.enabled) {
        config.cfgFilePath = paths.parse(configFile.filePath).dir;
        let fsync = (config.fsync = new PSFileSync(config));
        fsync.on("fsync_log", PSFileSync.log);
        if (startSyncing) {
          fsync.start();
        }
      }
      configs.length > ++idx ? await makeFileSyncs(configs, idx, configFile) : 5;
    }

    try {
      configFile = fs.readFileSync(filePath).toString();
      configFile = JSON.parse(configFile);
      configFile.filePath = filePath;
      makeFileSyncs(configFile.configs, 0, configFile);
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
