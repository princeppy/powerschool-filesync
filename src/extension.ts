import * as vscode from "vscode";
import { PowerSchoolSyncExtension } from "./file-extension";

export function activate(context: vscode.ExtensionContext) {
  new PowerSchoolSyncExtension(context);
}

// This method is called when your extension is deactivated
export function deactivate() {}
