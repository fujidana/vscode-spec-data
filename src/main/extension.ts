import * as vscode from 'vscode';
import { Provider } from './provider';

export function activate(context: vscode.ExtensionContext): void {
	new Provider(context);
}

export function deactivate(): void {
}
