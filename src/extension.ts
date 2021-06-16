import * as vscode from 'vscode';
import { ScanProvider } from './scanProvider';

export function activate(context: vscode.ExtensionContext) {
	new ScanProvider(context);
}

export function deactivate() {
}
