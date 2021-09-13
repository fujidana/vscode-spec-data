import * as vscode from 'vscode';
import { DataProvider } from './dataProvider';

export function activate(context: vscode.ExtensionContext): void {
	new DataProvider(context);
}

export function deactivate(): void {
}
