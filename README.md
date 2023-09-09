# powerschool filesync README

FileSync was forked from [filesync-vsce](https://github.com/pgmjah/filesync-vsce) and will keep files synchronized between src and dest locations. It can also clone git repositories before synchronizing, and rename files.

**_Note: This will not work on Mac/UNIX box._**

PowerSchool FileSync is a customized and trimmed down tool with just "SYNC" feature

## Features

- Keep files synchonized between source/destination directories.
- ~~Clone git repositories~~ **Removed**
- ~~Rename files~~ **Removed**
- Simple to configure.

## Extension Settings

- Show FileSync activity in the statusbar.

## FileSync Configuration

- Add file(s) called "fsconfig.json" (see below) to the folders you open, or are part of your workspace.

## fsconfig.json

- You can have multiple fsconfig.json files, the extension will find them in your workspace/folders and load each one.

The FileSync config file is a json object with the following layout:

```javascript
{
	"configs":
	[
		{
			"name":"sample_powerschool_sync_config",
			"enabled":true,
			"sync":
			[
				{
					"src":"c:/some/source/folder",
					"dest":"c:/some/dest/folder",
					"files":
					[
						"./syncFileOnly.ext",
						"./child_dir/otherFileOnly.ext"
					],
					"ignore":
					[
						"folder1/relative/to/src",
						"folder2/relative/to/src"
					],
					"bidir":true
				}
			]
		}
	]
}
```

- configs - You can have an array of config blocks, each specifying their own syncing actions.
- name - just an indentifier, has no intrinsic meaning.
- enabled - activate/ignore this block when starting.
- sync - array of objects specifying what directories you want synchronized where (can be a single object, if just one).
  - src - the source directory to syncronize.
  - dest - the destination directory to keep synchronized.
  - files - array of file names you want to sync (can be a single object, if just one). If not present will sync all files in src.
  - ignore - array of relative paths to src to be ignored when syncing (can be a single object, if just one).
  - bidir - bidirectional synchronization...that is, files will be removed from destination if they don't exist in the source.

## Commands

- FileSync: Create a fsconfig.json file - will generate a default config file in the workspace folder you choose.
- FileSync: Toggle synchronizing files/directories - selectively turn on/off synching for various directories.
- FileSync: Start synchronizing files/directories - start all the FileSyncs in loaded fsconfig.json files.
- FileSync: Stop synchronizing files/directories" - stop all the currently running FileSyncs.

## Release Notes

## 2.0.1

- Forked from https://github.com/pgmjah/filesync-vsce and customized
