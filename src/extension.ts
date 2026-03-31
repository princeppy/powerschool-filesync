import * as vscode from "vscode";
import { PowerSchoolSyncExtension } from "./file-extension";

let extension: PowerSchoolSyncExtension | undefined;

export function activate(context: vscode.ExtensionContext) {
  extension = new PowerSchoolSyncExtension(context);
}

// This method is called when your extension is deactivated
export function deactivate() {
  if (extension) {
    extension.stopFileSyncs();
    extension = undefined;
  }
}
