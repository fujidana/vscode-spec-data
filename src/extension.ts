import * as vscode from 'vscode';
import { DataProvider } from './dataProvider';

export function activate(context: vscode.ExtensionContext) {
	new DataProvider(context);
}

export function deactivate() {
}
