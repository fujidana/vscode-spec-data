import * as vscode from 'vscode';
import plotTemplate from './plotTemplate';
import merge = require('lodash.merge');
import { minimatch } from 'minimatch';
import { getTextDecoder } from './textEncoding';
import type { State, MessageToWebview, MessageFromWebview } from './previewTypes';

const SPEC_DATA_FILTER = { language: 'spec-data' };
const CSV_COLUMNS_FILTER = { language: 'csv-column' };
const CSV_ROWS_FILTER = { language: 'csv-row' };
const DPPMCA_FILTER = { language: 'dppmca' };
const CHIPLOT_FILTER = { language: 'chiplot' };
const DOCUMENT_SELECTOR = [SPEC_DATA_FILTER, CSV_COLUMNS_FILTER, CSV_ROWS_FILTER, DPPMCA_FILTER, CHIPLOT_FILTER];

const DPPMCA_BLOCK_REGEXP = /^<<([a-zA-Z0-9_ ]+)>>$/;

type Node = FileNode | DateNode | CommentNode | NameListNode | ValueListNode | ScanHeadNode | ScanDataNode | UnknownNode;
interface BaseNode { type: string, lineStart: number, lineEnd: number, occurance?: number }
interface FileNode extends BaseNode { type: 'file', value: string }
interface DateNode extends BaseNode { type: 'date', value: string }
interface CommentNode extends BaseNode { type: 'comment', value: string }
interface NameListNode extends BaseNode { type: 'nameList', kind: string, values: string[], mnemonic: boolean }
interface ValueListNode extends BaseNode { type: 'valueList', kind: string, values: number[] }
interface ScanHeadNode extends BaseNode { type: 'scanHead', index: number, code: string }
interface ScanDataNode extends BaseNode { type: 'scanData', headers: string[], data: number[][], xAxisSelectable: boolean }
interface UnknownNode extends BaseNode { type: 'unknown', kind: string, value: string }

interface Preview {
    uri: vscode.Uri;
    panel: vscode.WebviewPanel;
    enableMultipleSelection: boolean;
    scrollEditorWithPreview: boolean;
    tree?: Node[];
}

/**
 * Provider class for "spec-data" language
 */
export class DataProvider implements vscode.FoldingRangeProvider, vscode.DocumentSymbolProvider, vscode.WebviewPanelSerializer {
    readonly extensionUri;
    readonly subscriptions;
    readonly previews: Preview[] = [];

    livePreview: Preview | undefined = undefined;
    colorThemeKind: vscode.ColorThemeKind;
    textEditorVisibleRangesChangeDisposable: vscode.Disposable | undefined;

    lastScrollEditorTimeStamp = 0;
    lastScrollPreviewTimeStamp = 0;

    constructor(context: vscode.ExtensionContext) {
        this.extensionUri = context.extensionUri;
        this.subscriptions = context.subscriptions;
        this.colorThemeKind = vscode.window.activeColorTheme.kind;

        // callback of 'spec-data.showPreview'.
        const showPreviewCallback = async (...args: unknown[]) => {
            const uris = getTargetFileUris(args);
            if (uris.length) {
                this.showPreview(uris[uris.length - 1], false, false);
            }
        };

        // callback of 'spec-data.showPreviewToSide'.
        const showPreviewToSideCallback = async (...args: unknown[]) => {
            const uris = getTargetFileUris(args);
            if (uris.length) {
                this.showPreview(uris[uris.length - 1], false, true);
            }
        };

        // callback of 'spec-data.showPreviewToSide'.
        const showLockedPreviewCallback = async (...args: unknown[]) => {
            for (const uri of getTargetFileUris(args)) {
                this.showPreview(uri, true, false);
            }
        };

        // callback of 'spec-data.showLockedPreviewToSide'.
        const showLockedPreviewToSideCallback = async (...args: unknown[]) => {
            for (const uri of getTargetFileUris(args)) {
                this.showPreview(uri, true, true);
            }
        };

        // callback of 'spec-data.showSource'.
        const showSourceCallback = (..._args: unknown[]) => {
            const activePreview = this.getActivePreview();
            if (activePreview) {
                const document = vscode.workspace.textDocuments.find(document => document.uri.toString() === activePreview.uri.toString());
                if (document) {
                    vscode.window.showTextDocument(document);
                } else {
                    vscode.window.showTextDocument(activePreview.uri);
                }
            } else {
                vscode.window.showErrorMessage('Failed in finding active preview tab.');
            }
        };

        // callback of 'spec-data.refreshPreview'.
        const refreshPreviewCallback = async (..._args: unknown[]) => {
            const activePreview = this.getActivePreview();
            if (activePreview) {
                this.reloadPreview(activePreview, activePreview.uri);
            } else {
                vscode.window.showErrorMessage('Failed in finding active preview tab.');
            }
        };
        // callback of 'spec-data.toggleMultipleSelection'.
        const toggleMultipleSelectionCallback = (..._args: unknown[]) => {
            const activePreview = this.getActivePreview();
            if (activePreview) {
                const flag = !activePreview.enableMultipleSelection;
                activePreview.enableMultipleSelection = flag;
                const messageOut: MessageToWebview = { type: 'enableMultipleSelection', flag: flag };
                activePreview.panel.webview.postMessage(messageOut);
            } else {
                vscode.window.showErrorMessage('Failed in finding active preview tab.');
            }
        };

        // callback of 'spec-data.togglePreviewLock'.
        const togglePreviewLockCallback = (..._args: unknown[]) => {
            const activePreview = this.getActivePreview();
            if (activePreview) {
                const filePath = activePreview.uri.path;
                if (this.livePreview && activePreview.panel === this.livePreview.panel) {
                    // If the active view is a live preview, lock the view to the file.
                    this.livePreview = undefined;
                    const messageOut: MessageToWebview = { type: 'lockPreview', flag: true };
                    activePreview.panel.webview.postMessage(messageOut);
                    activePreview.panel.title = `[Preview] ${filePath.substring(filePath.lastIndexOf('/') + 1)}`;
                } else {
                    // If the active view is not a live preview...
                    if (this.livePreview) {
                        // close the previous live view if it exists...
                        this.livePreview.panel.dispose();
                    }
                    // and set the active view to live view.
                    this.livePreview = activePreview;
                    const messageOut: MessageToWebview = { type: 'lockPreview', flag: false };
                    activePreview.panel.webview.postMessage(messageOut);
                    activePreview.panel.title = `Preview ${filePath.substring(filePath.lastIndexOf('/') + 1)}`;
                }
            } else {
                vscode.window.showErrorMessage('Failed in finding active preview tab.');
            }
        };

        const activeTextEditorChangeListener = (editor: vscode.TextEditor | undefined) => {
            if (editor) {
                const document = editor.document;
                if (vscode.languages.match(DOCUMENT_SELECTOR, document)) {
                    if (this.livePreview && this.livePreview.uri.toString() !== document.uri.toString()) {
                        this.reloadPreview(this.livePreview, document);
                    }
                }
            }
        };

        const textEditorVisibleRangesChangeListener = (event: vscode.TextEditorVisibleRangesChangeEvent) => {
            const now = Date.now();
            if (now - this.lastScrollEditorTimeStamp > 1500 && event.visibleRanges.length > 0) {
                // Refrain from sending 'scrollPreview' message soon ( < 1.5 sec) after receiving 'scrollEditor' message.
                const line = event.visibleRanges[0].start.line;
                const previews = this.previews.filter(preview => preview.uri.toString() === event.textEditor.document.uri.toString());
                for (const preview of previews) {
                    const node = preview.tree?.find(node => (node.lineEnd >= line));
                    if (node) {
                        const messageOut: MessageToWebview = { type: 'scrollPreview', elementId: `l${node.lineStart}` };
                        preview.panel.webview.postMessage(messageOut);
                    }
                }
                this.lastScrollPreviewTimeStamp = now;
            }
        };

        const configurationChangeListner = (event: vscode.ConfigurationChangeEvent) => {
            if (event.affectsConfiguration('spec-data.preview.scrollEditorWithPreview')) {
                for (const preview of this.previews) {
                    preview.scrollEditorWithPreview = vscode.workspace.getConfiguration('spec-data.preview').get<boolean>('scrollEditorWithPreview', true);
                }
            }
            if (event.affectsConfiguration('spec-data.preview.scrollPreviewWithEditor')) {
                const scrollPreviewWithEditor: boolean = vscode.workspace.getConfiguration('spec-data.preview').get('scrollPreviewWithEditor', true);
                if (scrollPreviewWithEditor) {
                    if (!this.textEditorVisibleRangesChangeDisposable) {
                        this.textEditorVisibleRangesChangeDisposable = vscode.window.onDidChangeTextEditorVisibleRanges(textEditorVisibleRangesChangeListener);
                        context.subscriptions.push(this.textEditorVisibleRangesChangeDisposable);
                    }
                } else {
                    if (this.textEditorVisibleRangesChangeDisposable) {
                        const index = context.subscriptions.indexOf(this.textEditorVisibleRangesChangeDisposable);
                        if (index >= 0) {
                            context.subscriptions.splice(index, 1);
                        }
                        this.textEditorVisibleRangesChangeDisposable.dispose();
                    }
                    this.textEditorVisibleRangesChangeDisposable = undefined;
                }
            }
        };

        const activeColorThemeChangeListener = (colorTheme: vscode.ColorTheme) => {
            if (this.colorThemeKind !== colorTheme.kind) {
                // If the color theme kind is changed, query to change the plot template.
                for (const preview of this.previews) {
                    // According to the webview reference manual, the messages are
                    // only delivered if the webview is live (either visible or in 
                    // the background with `retainContextWhenHidden`).
                    // However, it seems invisible webviews also handle the following messages.
                    const messageOut: MessageToWebview = {
                        type: 'setTemplate',
                        template: getPlotlyTemplate(colorTheme.kind, preview.uri),
                        callback: 'relayout'
                    };
                    preview.panel.webview.postMessage(messageOut);
                }
            }
            this.colorThemeKind = colorTheme.kind;
        };

        // register providers and commands
        context.subscriptions.push(
            vscode.commands.registerCommand('spec-data.showPreview', showPreviewCallback),
            vscode.commands.registerCommand('spec-data.showPreviewToSide', showPreviewToSideCallback),
            vscode.commands.registerCommand('spec-data.showLockedPreview', showLockedPreviewCallback),
            vscode.commands.registerCommand('spec-data.showLockedPreviewToSide', showLockedPreviewToSideCallback),
            vscode.commands.registerCommand('spec-data.showSource', showSourceCallback),
            vscode.commands.registerCommand('spec-data.refreshPreview', refreshPreviewCallback),
            vscode.commands.registerCommand('spec-data.toggleMultipleSelection', toggleMultipleSelectionCallback),
            vscode.commands.registerCommand('spec-data.togglePreviewLock', togglePreviewLockCallback),
            vscode.languages.registerFoldingRangeProvider([SPEC_DATA_FILTER, DPPMCA_FILTER], this),
            vscode.languages.registerDocumentSymbolProvider([SPEC_DATA_FILTER, DPPMCA_FILTER], this),
            vscode.window.registerWebviewPanelSerializer('spec-data.preview', this),
            vscode.window.onDidChangeActiveTextEditor(activeTextEditorChangeListener),
            vscode.window.onDidChangeActiveColorTheme(activeColorThemeChangeListener),
            vscode.workspace.onDidChangeConfiguration(configurationChangeListner)
        );

        const scrollPreviewWithEditor = vscode.workspace.getConfiguration('spec-data.preview').get<boolean>('scrollPreviewWithEditor', true);
        if (scrollPreviewWithEditor) {
            this.textEditorVisibleRangesChangeDisposable = vscode.window.onDidChangeTextEditorVisibleRanges(textEditorVisibleRangesChangeListener);
            context.subscriptions.push(this.textEditorVisibleRangesChangeDisposable);
        }
    }

    /**
     * Required implementation of vscode.FoldingRangeProvider
     */
    public provideFoldingRanges(document: vscode.TextDocument, context: vscode.FoldingContext, token: vscode.CancellationToken): vscode.ProviderResult<vscode.FoldingRange[]> {
        if (token.isCancellationRequested) { return; }

        const ranges: vscode.FoldingRange[] = [];

        if (vscode.languages.match(SPEC_DATA_FILTER, document)) {
            const lineCount = document.lineCount;
            let prevLineIndex = -1;

            for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
                if (document.lineAt(lineIndex).isEmptyOrWhitespace) {
                    if (lineIndex !== prevLineIndex + 1) {
                        ranges.push(new vscode.FoldingRange(prevLineIndex + 1, lineIndex));
                    }
                    prevLineIndex = lineIndex;
                }
            }
        } else if (vscode.languages.match(DPPMCA_FILTER, document)) {
            const lineCount = document.lineCount;
            let prevLineIndex = -1;

            for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
                const lineText = document.lineAt(lineIndex).text;
                if (DPPMCA_BLOCK_REGEXP.test(lineText)) {
                    // console.log(lineText, prevLineIndex + 1, lineIndex);
                    if (lineText.endsWith('END>>')) {
                        if (prevLineIndex !== -1) {
                            ranges.push(new vscode.FoldingRange(prevLineIndex, lineIndex));
                        }
                        prevLineIndex = -1;
                    } else {
                        if (prevLineIndex !== -1) {
                            ranges.push(new vscode.FoldingRange(prevLineIndex, lineIndex - 1));
                        }
                        prevLineIndex = lineIndex;
                    }
                }
            }
        }
        return ranges;
    }

    /**
     * Required implementation of vscode.DocumentSymbolProvider
     */
    public provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
        if (token.isCancellationRequested) { return; }

        const symbols: vscode.DocumentSymbol[] = [];

        if (vscode.languages.match(SPEC_DATA_FILTER, document)) {
            const lineCount = document.lineCount;
            const scanLineRegex = /^(#S [0-9]+)\s*(\S.*)?$/;
            const otherLineRegex = /^(#[a-zA-Z][0-9]*)\s(\S.*)?$/;
            let prevLineIndex = -1;

            for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
                if (document.lineAt(lineIndex).isEmptyOrWhitespace) {
                    if (lineIndex !== prevLineIndex + 1) {
                        const lineTextAtBlockStart = document.lineAt(prevLineIndex + 1).text;
                        let matches: RegExpMatchArray | null;
                        if ((matches = lineTextAtBlockStart.match(scanLineRegex)) || (matches = lineTextAtBlockStart.match(otherLineRegex))) {
                            const range = new vscode.Range(prevLineIndex + 1, 0, lineIndex, 0);
                            const selectedRange = new vscode.Range(prevLineIndex + 1, 0, prevLineIndex + 1, matches[0].length);
                            symbols.push(new vscode.DocumentSymbol(matches[1], matches[2], vscode.SymbolKind.Key, range, selectedRange));
                        }
                    }
                    prevLineIndex = lineIndex;
                }
            }
        } else if (vscode.languages.match(DPPMCA_FILTER, document)) {
            const lineCount = document.lineCount;
            let prevBlock: [string, vscode.Range] | undefined;

            for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
                const line = document.lineAt(lineIndex);
                let matches: RegExpMatchArray | null;

                if (matches = line.text.match(DPPMCA_BLOCK_REGEXP)) {
                    if (matches[1].endsWith('END')) {
                        if (prevBlock) {
                            const range = new vscode.Range(prevBlock[1].start, line.range.end);
                            symbols.push(new vscode.DocumentSymbol(prevBlock[0], '', vscode.SymbolKind.Object, range, prevBlock[1]));
                        }
                        prevBlock = undefined;
                    } else {
                        if (prevBlock) {
                            const range = new vscode.Range(prevBlock[1].start, document.lineAt(lineIndex - 1).range.end);
                            symbols.push(new vscode.DocumentSymbol(prevBlock[0], '', vscode.SymbolKind.Object, range, prevBlock[1]));
                        }
                        prevBlock = [matches[1], line.range];
                    }
                }
            }
        }
        return symbols;
    }

    /**
     * Required implementation of vscode.WebviewPanelSerializer
     */
    public async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: State): Promise<void> {
        if (!state) {
            const message = 'Unable to restore the preview content because the previous state is not recorded. Probably the content had not been displayed at all in the previous session. The tab will be closed.';
            vscode.window.showErrorMessage(message, 'OK').then(() => panel.dispose());
            return;
        }
        this.initPreview(panel, vscode.Uri.parse(state.sourceUri), state.lockPreview);
    }

    /**
     * Show a preview. If the live preview exists and new preview is not locked, 
     * the preexisting panel is reused. Else a new panel is created.
     * @param uri Source file URI.
     * @param lockPreview Flag whether the new preview panel is locked.
     * @param showToSide Flag whether the new preview panel is shown to side (`true`) or in the active editor (`false`).
     * @returns Preview object or `undefined` if failed to parse a file.
     */
    private async showPreview(uri: vscode.Uri, lockPreview: boolean, showToSide: boolean) {
        if (!lockPreview && this.livePreview) {
            // If a live preview panel exists and new panel is not locked...
            if (this.livePreview.uri.toString() !== uri.toString()) {
                // Update the content if the URIs are different.
                if (!(await this.reloadPreview(this.livePreview, uri))) {
                    return undefined;
                }
            }
            this.livePreview.panel.reveal();
            return this.livePreview;
        } else {
            // Else create a new panel as a live panel.
            return await this.initPreview(undefined, uri, lockPreview, showToSide);
        }
    }

    /**
     * Register event handlers and then make a content from source.
     * Create a webview panel if `panel` parameter is undefined. 
     * @param panel Webveiw panel or `undefined`.
     * @param uri Source file URI.
     * @param lockPreview Flag whether the new preview panel is locked.
     * @param showToSide Flag whether the new preview panel is shown to side (`true`) or in the active editor (`false`).
     * @returns Preview object if succeeded in parsing a file or `undefined`.
     */
    private async initPreview(panel: vscode.WebviewPanel | undefined, uri: vscode.Uri, lockPreview = false, showToSide = false) {
        const tree = await parseDocumentContent(uri);
        if (!tree) {
            const message = `Failed in parsing the file: ${vscode.workspace.asRelativePath(uri)}.`;
            vscode.window.showErrorMessage(message);
            return undefined;
        }

        const config = vscode.workspace.getConfiguration('spec-data.preview', uri);

        // If panel is not provided, create a new panel.
        let panel2: vscode.WebviewPanel;
        if (panel) {
            panel2 = panel;
        } else {
            const retainContextWhenHidden = config.get<boolean>('retainContextWhenHidden', false);
            panel2 = vscode.window.createWebviewPanel(
                'spec-data.preview',
                'Preview spec data',
                showToSide ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active,
                {
                    // localResourceRoots: [this.extensionUri],
                    enableScripts: true,
                    retainContextWhenHidden: retainContextWhenHidden,
                }
            );
        }
        const enableMultipleSelection = config.get<boolean>('plot.experimental.enableMulitpleSelection', false);
        const scrollEditorWithPreview = config.get<boolean>('scrollEditorWithPreview', true);
        const preview: Preview = { uri, panel: panel2, enableMultipleSelection, scrollEditorWithPreview };
        this.previews.push(preview);
        if (!lockPreview) {
            this.livePreview = preview;
        }

        panel2.onDidDispose(() => {
            // remove the closed preview from the array.
            const index = this.previews.findIndex(preview => preview.panel === panel2);
            if (index >= 0) {
                this.previews.splice(index, 1);
            }

            // clear the live preview reference if the closed preview is the live preview.
            if (this.livePreview && this.livePreview.panel === panel2) {
                this.livePreview = undefined;
            }
        }, null, this.subscriptions);

        panel2.webview.onDidReceiveMessage((messageIn: MessageFromWebview) => {
            if (messageIn.type === 'scrollEditor') {
                const preview = this.previews.find(preview => preview.panel === panel2);
                if (preview && preview.scrollEditorWithPreview === true) {
                    const now = Date.now();
                    if (now - this.lastScrollPreviewTimeStamp > 1500) {
                        // Ignore 'scrollEditor' message soon ( < 1.5 sec) after sending 'scrollPreview' command.
                        for (const editor of vscode.window.visibleTextEditors) {
                            if (editor.document.uri.toString() === preview.uri.toString()) {
                                editor.revealRange(new vscode.Range(messageIn.line, 0, messageIn.line, 0), vscode.TextEditorRevealType.AtTop);
                            }
                        }
                        this.lastScrollEditorTimeStamp = now;
                    }
                }
            } else if (messageIn.type === 'requestPlotData') {
                const tree = this.previews.find(preview => preview.panel === panel2)?.tree;
                if (tree) {
                    const node = tree.find(node => node.occurance === messageIn.occurance && node.type === 'scanData');
                    if (node && node.type === 'scanData' && node.data.length) {
                        const { x: xIndex, y1: y1Indexes, y2: y2Indexes } = messageIn.indexes;

                        const xData = (xIndex >= 0 && xIndex < node.data.length) ?
                            { label: node.headers[xIndex], array: node.data[xIndex] } :
                            { label: 'point', array: Array(node.data[0].length).fill(0).map((_x, i) => i)};
                        const y1Data = y1Indexes.filter(y_i => y_i < node.data.length).map(y_i => { return { label: node.headers[y_i], array: node.data[y_i] }; });
                        const y2Data = y2Indexes.filter(y_i => y_i < node.data.length).map(y_i => { return { label: node.headers[y_i], array: node.data[y_i] }; });

                        const messageOut: MessageToWebview = {
                            type: 'updatePlot',
                            occurance: messageIn.occurance,
                            x: xData,
                            y1: y1Data,
                            y2: y2Data,
                            action: messageIn.callback
                        };
                        panel2.webview.postMessage(messageOut);

                    }
                }
            } else if (messageIn.type === 'contentLoaded') {
                const messageTo: MessageToWebview = {
                    type: 'setTemplate',
                    template: getPlotlyTemplate(vscode.window.activeColorTheme.kind, uri),
                    callback: 'newPlot'
                };
                panel2.webview.postMessage(messageTo);
            }
        }, undefined, this.subscriptions);

        this.updatePreviewWithTree(preview, tree);

        return preview;
    }

    /**
     * Reuse the panel in `preview` and update a content from source.
     * @param preview Preview object
     * @param source URI or document.
     * @returns Preview object if succeeded in parsing a file or `undefined`.
     */
    private async reloadPreview(preview: Preview, source: vscode.Uri | vscode.TextDocument) {
        const uri = source instanceof vscode.Uri ? source : source.uri;

        const tree = await parseDocumentContent(source);
        if (!tree) {
            const message = `Failed in parsing the file: ${vscode.workspace.asRelativePath(uri)}.`;
            vscode.window.showErrorMessage(message);
            return undefined;
        }
        
        preview.uri = uri;
        const config = vscode.workspace.getConfiguration('spec-data.preview', uri);
        preview.enableMultipleSelection = config.get<boolean>('plot.experimental.enableMulitpleSelection', false);
        preview.scrollEditorWithPreview = config.get<boolean>('scrollEditorWithPreview', true);

        this.updatePreviewWithTree(preview, tree);
        return preview;
    }

    private updatePreviewWithTree(preview: Preview, tree: Node[]) {
        const lockPreview = !(this.livePreview && this.livePreview === preview);
        const webview = preview.panel.webview;
        const label = lockPreview ? '[Preview]' : 'Preview';
        const plotlyJsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'preview', 'node_modules', 'plotly.js-basic-dist-min', 'plotly-basic.min.js'));
        const controllerJsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'preview', 'previewController.js'));

        preview.tree = tree;
        preview.panel.title = `${label} ${preview.uri.path.substring(preview.uri.path.lastIndexOf('/') + 1)}`;
        preview.panel.webview.html = getWebviewContent(webview.cspSource, preview.uri, plotlyJsUri, controllerJsUri, tree, preview.enableMultipleSelection);

        const messageOut: MessageToWebview = { type: 'lockPreview', flag: lockPreview };
        preview.panel.webview.postMessage(messageOut);
    }

    private getActivePreview(): Preview | undefined {
        return this.previews.find(preview => preview.panel.active);
    }
}

function getTargetFileUris(args: unknown[]): vscode.Uri[] {
    if (args && args.length > 0) {
        // typically, the type of args is [vscode.Uri, vscode.Uri[]]
        if (args.length >= 2 && Array.isArray(args[1])) {
            return args[1].filter(arg => arg instanceof vscode.Uri);
        } else if (args[0] instanceof vscode.Uri) {
            return [args[0]];
        } else {
            vscode.window.showErrorMessage('Unknown command arguments.');
        }
    } else {
        // If the URI is not provided via the arguments, returns the URI and contents of the active editor.
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            return [editor.document.uri];
        } else {
            vscode.window.showErrorMessage('Active editor is not found.');
        }
    }
    return [];
}

async function parseDocumentContent(source: vscode.Uri | vscode.TextDocument) {
    let uri: vscode.Uri;
    let document: vscode.TextDocument | undefined;

    if (source instanceof vscode.Uri) {
        uri = source;
        document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
    } else {
        document = source;
        uri = document.uri;
    }

    let text: string;
    let languageId: string | undefined;

    if (document) {
        // If `document` is provided or found, use its values.
        if (vscode.languages.match(DOCUMENT_SELECTOR, document)) {
            languageId = document.languageId;
            text = document.getText();
        } else {
            return undefined;
        }
    } else {
        // If `document` is not found, read contents from the file.

        // Determine the file type (language ID) for a file.
        // First, compare the filename with a user-defined setting ("files.associations"), 
        // then with default extension patterns.
        const associations = Object.entries(
            vscode.workspace.getConfiguration('files', uri).get<Record<string, string>>('associations', {}),
        ).concat([['*.spec', 'spec-data'], ['*.mca', 'dppmca'], ['*.chi', 'chiplot']]);

        for (const [key, value] of associations) {
            if (minimatch(uri.path, key, { matchBase: true })) {
                languageId = DOCUMENT_SELECTOR.map(filter => filter.language).includes(value) ? value : undefined;
                break;
            }
        }

        if (languageId === undefined) {
            return undefined;
        }

        // Read the content from a file. Use file encoding for the language ID (if "files.encoding" is set.)
        text = getTextDecoder({ languageId, uri }).decode(await vscode.workspace.fs.readFile(uri));
    }

    // Parse the document contents.
    const lines = text.split(/\r\n|\n/);
    if (lines.length === 0) {
        return undefined;
    } else if (languageId === SPEC_DATA_FILTER.language) {
        return parseSpecDataContent(lines);
    } else if (languageId === CSV_COLUMNS_FILTER.language) {
        return parseCsvContent(lines, true);
    } else if (languageId === CSV_ROWS_FILTER.language) {
        return parseCsvContent(lines, false);
    } else if (languageId === DPPMCA_FILTER.language) {
        return parseDppmcaContent(lines);
    } else if (languageId === CHIPLOT_FILTER.language) {
        return parseChiplotContent(lines);
        // } else {
        //     // Guess the file type from the first line
        //     // if language ID is not provided (or not one of SupportedLanguage).
        //     const otherLineRegex = /^(#[a-zA-Z][0-9]*)\s(\S.*)?$/;
        //     return lines[0].match(otherLineRegex) ? parseSpecDataContent(lines) : parseChiplotContent(lines);
    } else {
        return undefined;
    }
}

function parseSpecDataContent(lines: string[]): Node[] | undefined {
    const lineCount = lines.length;

    const fileRegex = /^(#F) (.*)$/;
    const dateRegex = /^(#D) (.*)$/;
    const commentRegex = /^(#C) (.*)$/;
    const nameListRegex = /^(?:#([OJoj])([0-9]+)) (.*)$/;
    const valueListRegex = /^(?:#([P])([0-9]+)) (.*)$/;
    const scanHeadRegex = /^(#S) ([0-9]+) (.*)$/;
    const scanNumberRegex = /^(#N) ([0-9]+)$/;
    const scanDataRegex = /^(#L) (.*)$/;
    const unknownRegex = /^#(?:([a-zA-Z][0-9]*) (.*)|.*)$/;
    const emptyLineRegex = /^\s*$/;

    let matches: RegExpMatchArray | null;
    let prevNodeIndex = -1;
    let columnNumberInHeader = -1;
    let columnNumberInBody = -1;
    const nodes: Node[] = [];

    let fileOccurance = 0;
    let dateOccurance = 0;
    let commentOccurance = 0;
    // let nameListOccurance = 0;
    let valueListOccuracne = 0;
    let scanHeadOccurance = 0;
    // let scanNumberOccurance = 0;
    let scanDataOccurance = 0;
    // let  unknownOccurance = 0;

    for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
        const lineText = lines[lineIndex];
        if ((matches = lineText.match(fileRegex)) !== null) {
            nodes.push({ type: 'file', lineStart: lineIndex, lineEnd: lineIndex, occurance: fileOccurance, value: matches[2] });
            fileOccurance++;
        } else if ((matches = lineText.match(dateRegex)) !== null) {
            nodes.push({ type: 'date', lineStart: lineIndex, lineEnd: lineIndex, occurance: dateOccurance, value: matches[2] });
            dateOccurance++;
        } else if ((matches = lineText.match(commentRegex)) !== null) {
            nodes.push({ type: 'comment', lineStart: lineIndex, lineEnd: lineIndex, occurance: commentOccurance, value: matches[2] });
            commentOccurance++;
        } else if ((matches = lineText.match(nameListRegex)) !== null) {
            let kind, isMnemonic, separator;
            if (matches[1] === matches[1].toLowerCase()) {
                isMnemonic = true;
                separator = ' ';
            } else {
                isMnemonic = false;
                separator = '  ';
            }
            if (matches[1].toLowerCase() === 'o') {
                kind = 'motor';
            } else if (matches[1].toLowerCase() === 'j') {
                kind = 'counter';
            } else {
                kind = matches[1];
            }
            const listIndex = parseInt(matches[2]);
            const prevNode = nodes.length > 0 ? nodes[nodes.length - 1] : undefined;
            if (prevNode && prevNode.type === 'nameList' && prevNode.kind === kind && prevNode.mnemonic === isMnemonic) {
                if (prevNodeIndex !== listIndex - 1) {
                    vscode.window.showErrorMessage(`Inconsequent index of the name list: line ${lineIndex + 1}`);
                    return undefined;
                }
                prevNode.values.push(...(matches[3].trimEnd().split(separator)));
                prevNode.lineEnd = lineIndex;
                prevNodeIndex = listIndex;
            } else {
                if (listIndex !== 0) {
                    vscode.window.showErrorMessage(`The name list not starding with 0: line ${lineIndex + 1}`);
                    return undefined;
                }
                nodes.push({ type: 'nameList', lineStart: lineIndex, lineEnd: lineIndex, kind: kind, values: matches[3].trimEnd().split(separator), mnemonic: isMnemonic });
                prevNodeIndex = 0;
            }
        } else if ((matches = lineText.match(valueListRegex)) !== null) {
            let kind;
            if (matches[1] === 'P') {
                kind = 'motor';
            } else {
                kind = matches[1];
            }
            const listIndex = parseInt(matches[2]);
            const prevNode = nodes.length > 0 ? nodes[nodes.length - 1] : undefined;
            if (prevNode && prevNode.type === 'valueList' && prevNode.kind === kind) {
                if (prevNodeIndex !== listIndex - 1) {
                    vscode.window.showErrorMessage(`Inconsequent index of the value list: line ${lineIndex + 1}`);
                    return undefined;
                }
                prevNode.values.push(...(matches[3].trimEnd().split(' ').map(value => parseFloat(value))));
                prevNode.lineEnd = lineIndex;
                prevNodeIndex = listIndex;
            } else {
                if (listIndex !== 0) {
                    vscode.window.showErrorMessage(`The value list not starding with 0: line ${lineIndex + 1}`);
                    return undefined;
                }
                nodes.push({ type: 'valueList', lineStart: lineIndex, lineEnd: lineIndex, occurance: valueListOccuracne, kind: kind, values: matches[3].trimEnd().split(' ').map(value => parseFloat(value)) });
                valueListOccuracne++;
                prevNodeIndex = 0;
            }
        } else if ((matches = lineText.match(scanHeadRegex)) !== null) {
            nodes.push({ type: 'scanHead', lineStart: lineIndex, lineEnd: lineIndex, occurance: scanHeadOccurance, index: parseInt(matches[2]), code: matches[3] });
            scanHeadOccurance++;
        } else if ((matches = lineText.match(scanNumberRegex)) !== null) {
            columnNumberInHeader = parseInt(matches[2]);
        } else if ((matches = lineText.match(scanDataRegex)) !== null) {
            // The separator between motors and counters are 4 whitespaces (in old spec version only?).
            // The separator between respective motors and counters are 2 whitespaces.
            // const headers = matches[2].split('    ', 2).map(a => a.split('  ')).reduce((a, b) => a.concat(b));
            const headers = matches[2].trim().split(/ {2,}|\t/);
            if (columnNumberInHeader === -1) {
                // for lazy format in which "#N" line does not exit.
                columnNumberInHeader = headers.length;
            } else if (headers.length !== columnNumberInHeader) {
                vscode.window.showErrorMessage(`mismatch in the number of columns. (line ${lineIndex + 1}). #N: ${columnNumberInHeader}, #L: ${headers.length}`);
                return undefined;
            }
            const lineStart = lineIndex;

            // read succeeding lines until EOF or non-data line.
            const data: number[][] = [];
            for (; lineIndex + 1 < lineCount; lineIndex++) {
                const blockLineText = lines[lineIndex + 1];
                if (blockLineText.match(unknownRegex) || blockLineText.match(emptyLineRegex)) {
                    break;
                }
                // The separator between motors and counters are 2 whitespaces.
                // The separator between respective motors and counters are 1 whitespace.
                // const rows = blockLineText.split('  ', 2).map(a => a.split(' ')).reduce((a, b) => a.concat(b));
                const rows = blockLineText.trim().split(/ {1,}|\t/);
                if (columnNumberInBody === -1) {
                    // In case the first line of the scan body, compare the line number of the header part.
                    // This mismatch can happen owing to spec's bug around `roisetup` and `disable` commands.
                    // So in this case, just show a message and do not stop parsing.
                    if (rows.length !== columnNumberInHeader) {
                        vscode.window.showWarningMessage(`mismatch in the number of columns (line ${lineIndex + 2}). header: ${columnNumberInHeader}), body: ${rows.length}.`);
                    }
                    columnNumberInBody = rows.length;
                } else if (rows.length !== columnNumberInBody) {
                    // In case the second or any later lines, compare with the first line.
                    vscode.window.showErrorMessage(`mismatch in the number of columns (line ${lineIndex + 2}). expected: ${columnNumberInBody},  ${rows.length}.`);
                    return undefined;
                }
                data.push(rows.map(item => parseFloat(item)));
            }
            // transpose the two-dimensional data array
            const data2 = data.length > 0 ? data[0].map((_, colIndex) => data.map(row => row[colIndex])) : data;

            nodes.push({ type: 'scanData', lineStart: lineStart, lineEnd: lineIndex, occurance: scanDataOccurance, headers: headers, data: data2, xAxisSelectable: true });
            scanDataOccurance++;
            columnNumberInHeader = -1;
            columnNumberInBody = -1;
        } else if ((matches = lineText.match(unknownRegex)) !== null) {
            nodes.push({ type: 'unknown', lineStart: lineIndex, lineEnd: lineIndex, kind: matches[1], value: matches[2] });
        }
    }
    return nodes.length !== 0 ? nodes : undefined;
}

// character-separated values. The delimiter is auto-detected from a horizontal tab, a whitespace, or a comma. 
function parseCsvContent(lines: string[], columnWise: boolean): Node[] | undefined {
    const lineCount = lines.length;
    const nodes: Node[] = [];
    let dataOccurrance = 0, commentOccurance = 0;

    for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
        let delimRegexp: RegExp | undefined;
        let rowNumber = 0;
        let headers: string[] | undefined;
        let data: number[][] = [];
        let dataStartIndex = 0;
        let isEsrfMca = false;
        // let columnNumber = 0;

        // skip lines until data array.
        for (; lineIndex < lineCount; lineIndex++) {
            const lineText = lines[lineIndex];

            if (lineText.trim().length === 0) {
                // Skip an empty line.
                continue;
            } else if (lineText.startsWith('#')) {
                // Skip a comment line after appending the text to the nodes.
                nodes.push({ type: 'comment', lineStart: lineIndex, lineEnd: lineIndex, occurance: commentOccurance, value: lineText.substring(1) });
                commentOccurance++;
                continue;
            } else if (!columnWise && lineText.startsWith('@A ')) {
                // If the line starts with "@A", it is data in ESRF's MCA format.
                // Trim the prefix: "@A ".
                isEsrfMca = true;

                // Concatenate the lines that ends with a backslash.
                let lineText2 = lineText.substring(3);
                while (lineText2.endsWith('\\') && lineIndex + 1 < lineCount) {
                    lineText2 = lineText2.slice(0, -1) + lines[lineIndex + 1];
                    lineIndex++;
                }
                const firstRowCells = lineText2.trim().split(/\s+/);
                delimRegexp = new RegExp(/\s+/);
                rowNumber = firstRowCells.length;
                data.push(firstRowCells.map(cell => parseFloat(cell)));
                dataStartIndex = lineIndex;
                lineIndex++;
                break;
            } else {
                let firstCell: string;
                let delimMatch: RegExpExecArray | null;
                if ((delimMatch = /[\t, ]/.exec(lineText)) !== null) {
                    // If the first cell delimited by a delimiter (a tab, comma, or whitespace) is a number, go to the next step.
                    firstCell = lineText.slice(0, delimMatch.index);
                    if (delimMatch[0] === ' ') {
                        delimRegexp = / +/;
                    } else {
                        delimRegexp = new RegExp(delimMatch[0]);
                    }
                } else {
                    firstCell = lineText;
                    delimRegexp = /[\t, ]/;
                }

                if (firstCell.toLowerCase() === 'nan' || !isNaN(Number(firstCell))) {
                    const firstRowCells = lineText.split(delimRegexp);
                    rowNumber = firstRowCells.length;
                    data.push(firstRowCells.map(cell => parseFloat(cell)));

                    // if the previous line has the same number of cells, treat it as a column header.
                    if (lineIndex > 0) {
                        const prevLineText = lines[lineIndex - 1];
                        const prevLineText2 = prevLineText.startsWith('#') ? prevLineText.substring(1).trimStart() : prevLineText;
                        const colLabels = prevLineText2.split(delimRegexp);
                        if (colLabels.length === rowNumber) {
                            headers = colLabels;
                        }
                    }

                    dataStartIndex = lineIndex;
                    lineIndex++;
                    break;
                }
            }
        }

        // If no numeric cell is found, exit.
        if (data.length === 0 || !delimRegexp) {
            break;
        }

        // Read the rest of lines and append numeric cells to `data`.
        for (; lineIndex < lineCount; lineIndex++) {
            const lineText = lines[lineIndex];
            if (lineText.length === 0) {
                break;
            } else if (lineText.startsWith('#')) {
                lineIndex--;
                break;
            } else if (isEsrfMca) {
                lineIndex--;
                break;
            } else {
                const currentRowCells = lineText.split(delimRegexp);
                if (currentRowCells.length !== rowNumber) {
                    // mismatch of column number
                    return undefined;
                }
                data.push(currentRowCells.map(cell => parseFloat(cell)));
            }
        }

        // Add the read data to the nodes.
        if (columnWise) {
            data = data[0].map((_, colIndex) => data.map(row => row[colIndex]));
            if (!headers) {
                headers = Array(data.length).fill(0).map((_x, i) => `column ${i}`);
            }
        } else {
            headers = Array(data.length).fill(0).map((_x, i) => `row ${i}`);
        }
        nodes.push({ type: 'scanData', lineStart: dataStartIndex, lineEnd: lineIndex - 1, occurance: dataOccurrance, headers: headers, data: data, xAxisSelectable: columnWise });
        dataOccurrance++;
    }

    if (nodes.some(node => node.type === 'scanData')) {
        return nodes;
    }
}

function parseDppmcaContent(lines: string[]): Node[] | undefined {
    type Block = { label: string, items: string[], lineStart: number, lineEnd: number };
    let prevBlock: Block | undefined;
    const blocks: Block[] = [];
    const lineCount = lines.length;

    // serparate lines by block headers (e.g., "<<PMCA SPECTRUM>>")
    for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
        const lineText = lines[lineIndex];
        let matches: RegExpMatchArray | null;

        if (matches = lineText.match(DPPMCA_BLOCK_REGEXP)) {
            prevBlock = { label: matches[1], items: [], lineStart: lineIndex + 1, lineEnd: lineIndex + 1 };
            blocks.push(prevBlock);
        } else if (prevBlock) {
            prevBlock.lineEnd = lineIndex;
            prevBlock.items.push(lineText);
        }
    }

    // use data in "<<DATA>>" block for a graph.
    const nodes: Node[] = [];
    let occurance = 0;
    for (const block of blocks) {
        if (block.label === 'DATA') {
            const data1d = block.items.map(lineText => parseInt(lineText));
            nodes.push({ type: 'scanData', lineStart: block.lineStart, lineEnd: block.lineEnd, occurance: occurance, headers: ['count'], data: [data1d], xAxisSelectable: false });
            occurance++;
        }
    }

    return nodes;
}

function parseChiplotContent(lines: string[]): Node[] | undefined {
    // chiplot format:
    // 
    // 1st line: title
    // 2nd line: x-axis
    // 3rd line: y-axis
    // 4th line: number of point per data-set and optionally number of data-set
    // following lines: data
    // 
    // The separator at 4th line and data rows is one or more spaces or a comma.
    const lineCount = lines.length;
    if (lineCount < 6) {
        return undefined;
    }

    const title = lines[0].trim();
    const headers = lines[1].trim().split(/\s*,\s*|\s{2,}/).concat(lines[2].trim().split(/\s*,\s*|\s{2,}/));
    const matches = lines[3].match(/^\s*([0-9]+)((\s*,\s*|\s+)([0-9]+))?/);
    if (!matches) {
        return undefined;
    }
    const rowNumber = parseInt(matches[1]);
    if (isNaN(rowNumber) || rowNumber < 1) {
        return undefined;
    }

    // const emptyLineRegex = /^\s*$/;
    const separatorRegex = /\s*,\s*|\s+/;

    const data: number[][] = [];
    let lineIndex;
    for (lineIndex = 4; lineIndex < lineCount; lineIndex++) {
        const lineText = lines[lineIndex];
        if (lineText.length === 0) {
            break;
        }
        const cells = lineText.trim().split(separatorRegex);
        data.push(cells.map(cell => parseFloat(cell)));
    }

    const columnNumber = data[0].length;

    if (data.length !== rowNumber) {
        // row number mismatch with the header (4th line).
        return undefined;
    } else if (data.some(columns => columns.length !== columnNumber)) {
        // column number not equal with the first data row (5th line)
        return undefined;
    }
    // transpose the two-dimensional data array
    const data2 = data[0].map((_, colIndex) => data.map(row => row[colIndex]));

    // adjust the number of headers (axis labels) to that of data columns
    let headers2;
    if (headers.length < columnNumber) {
        headers2 = headers;
        for (let index = headers.length; index < columnNumber; index++) {
            headers2.push(`[${index.toString()}]`);
        }
    } else {
        headers2 = headers.slice(0, columnNumber);
    }

    const nodes: Node[] = [];
    nodes.push({ type: 'file', lineStart: 0, lineEnd: 0, occurance: 0, value: title });
    nodes.push({ type: 'scanData', lineStart: 4, lineEnd: lineIndex, occurance: 0, headers: headers2, data: data2, xAxisSelectable: true });

    return nodes;
}

function getWebviewContent(cspSource: string, sourceUri: vscode.Uri, plotlyJsUri: vscode.Uri, controllerJsJri: vscode.Uri, nodes: Node[], enableMultipleSelection: boolean): string {
    const nameLists: { [name: string]: string[] } = {};
    const mnemonicLists: { [name: string]: string[] } = {};

    const config = vscode.workspace.getConfiguration('spec-data.preview', sourceUri);
    const hideTable = config.get<boolean>('table.hide', true);
    const columnsPerLine = config.get<number>('table.columnsPerLine', 8);
    const headerType = config.get<string>('table.headerType', 'mnemonic');
    const maximumPlots = config.get<number>('plot.maximumNumberOfPlots', 25);
    const plotHeight = config.get<number>('plot.height', 400);
    const enableRightAxis = config.get<boolean>('plot.experimental.enableRightAxis', false);

    // Apply CSP when in untrusted workspaces, even when 
    // it is disabled not in workspace settings but in user settings.
    const applyCsp = vscode.workspace.isTrusted ? config.get<boolean>('applyContentSecurityPolicy', true) : true;

    function getSanitizedString(text: string) {
        // const charactersReplacedWith = ['&amp;', '&lt;', '&gt;', '&quot;', '&#39;'];
        // return text.replace(/[&<>"']/g, (match) => charactersReplacedWith['&<>"\''.indexOf(match)]);
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function getAttributesForNode(node: Node) {
        let str = `id="l${node.lineStart}" class="${node.type}"`;
        if (node.occurance !== undefined) {
            str += ` data-occurance="${node.occurance}"`;
        }
        return str;
    }

    /** create components to select arrays (<select>) and select log-linear <input> */
    function getAxisSelectAndOptions(axis: string, occurance: number | undefined, headers: string[], size?: number, useLogInput?: boolean, hidden?: boolean) {
        const hiddenStr = hidden === true ? ' hidden' : '';
        const sizeStr = size !== undefined ? ` data-size-for-multiple=${size}` : '';
        // const isMultipleStr = isMultiple ? ' multiple' : '';
        let tmpStr;
        tmpStr = `<span${hiddenStr}>; </span>
<label for="${axis}AxisSelect${occurance}"${hiddenStr}><var>${axis}</var>:</label>
<select id="${axis}AxisSelect${occurance}" class="${axis}AxisSelect" data-axis="${axis}"${hiddenStr}${sizeStr}>
`;
        tmpStr += headers.map((item, index) => `<option value="${index}">${getSanitizedString(item)}</option>`).join('');
        tmpStr += `</select>
`;
        if (useLogInput) {
            tmpStr += `<span${hiddenStr}>,</span><input type="checkbox" id="${axis}LogInput${occurance}" class="${axis}LogInput"${hiddenStr}>
<label for="${axis}LogInput${occurance}"${hiddenStr}>log</label>`;
        }

        return tmpStr;
    }

    let header = `<!DOCTYPE html>
<html lang="en">
<head data-maximum-plots="${maximumPlots}" data-plot-height="${plotHeight}" data-hide-table="${Number(hideTable)}" data-source-uri="${sourceUri.toString()}" data-enable-multiple-selection="${Number(enableMultipleSelection)}">
	<meta charset="UTF-8">
`;
    if (applyCsp) {
        header += `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob:; style-src 'unsafe-inline'; script-src ${cspSource};">
`;
    }
    header += `<title>Preview of spec-data</title>
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="${plotlyJsUri}"></script>
    <script src="${controllerJsJri}"></script>
</head>
<body>
`;

    let body = "";
    for (const node of nodes) {
        if (node.type === 'file') {
            body += `<h1 ${getAttributesForNode(node)}>${getSanitizedString(node.value)}</h1>`;
        } else if (node.type === 'date') {
            body += `<p ${getAttributesForNode(node)}>Date: ${getSanitizedString(node.value)}</p>`;
        } else if (node.type === 'comment') {
            body += `<p ${getAttributesForNode(node)}>Comment: ${getSanitizedString(node.value)}</p>`;
        } else if (node.type === 'nameList') {
            if (node.mnemonic) {
                mnemonicLists[node.kind] = node.values.map(value => getSanitizedString(value));
            } else {
                nameLists[node.kind] = node.values.map(value => getSanitizedString(value));
            }
        } else if (node.type === 'scanHead') {
            body += `<h2 ${getAttributesForNode(node)}>Scan ${node.index}: <code>${getSanitizedString(node.code)}</code></h2>`;
        } else if (node.type === 'valueList') {
            const valueList = node.values;
            const headerList = (headerType === 'Name') ? nameLists['motor'] : (headerType === 'Mnemonic') ? mnemonicLists['motor'] : undefined;
            const occurance = node.occurance;
            body += `<div ${getAttributesForNode(node)}>`;
            if (headerList && (headerList.length !== valueList.length)) {
                body += '<p><em>The number of scan headers and data columns mismatched.</em></p>';
            } else {
                body += `<p>
<input type="checkbox" id="showValueListInput${occurance}" class="showValueListInput">
<label for="showValueListInput${occurance}">Show Prescan Table</label>
</p>
<table id="valueListTable${occurance}" class="valueListTable">
<caption>${getSanitizedString(node.kind)}</caption>
`;
                for (let row = 0; row < Math.ceil(valueList.length / columnsPerLine); row++) {
                    if (headerList) {
                        const headerListInRow = headerList.slice(row * columnsPerLine, Math.min((row + 1) * columnsPerLine, headerList.length));
                        body += `<tr>${headerListInRow.map(item => `<td><strong>${item}</td></strong>`).join('')}</tr>`;
                    }
                    const valueListInRow = valueList.slice(row * columnsPerLine, Math.min((row + 1) * columnsPerLine, valueList.length));
                    body += `<tr>${valueListInRow.map(item => `<td>${item}</td>`).join('')}</tr>`;
                }
                body += `</table>`;
            }
            body += `</div>`;
        } else if (node.type === 'scanData') {
            const data = node.data;
            const headers = node.headers;
            const occurance = node.occurance;

            body += `<div ${getAttributesForNode(node)}>`;
            if (data.length) {
                body += `<p>
<input type="checkbox" id="showPlotInput${occurance}" class="showPlotInput">
<label for="showPlotInput${occurance}">Show Plot</label>`;
                const size = Math.min((node.xAxisSelectable ? headers.length + 1 : headers.length), 4);
                body += getAxisSelectAndOptions('x', occurance, [...headers, '[point]'], size, false, !node.xAxisSelectable);
                body += getAxisSelectAndOptions('y', occurance, headers, size, true, false);
                body += getAxisSelectAndOptions('y2', occurance, [...headers, '[none]'], size, true, !enableRightAxis);
                body += `.</p>
<div id="plotly${occurance}" class="scanDataPlot"></div>
`;
            }
            body += `</div>`;
            // } else if (node.type === 'unknown') {
            //     body += `<p> #${node.kind} ${node.value}`;
        }
    }

    body += `</body>
    </html>
    `;

    return header + body;
}

type PlotlyTemplate = { data?: unknown[], layout?: unknown };
type UserPlotlyTemplates = { light?: PlotlyTemplate, dark?: PlotlyTemplate, highContrast?: PlotlyTemplate, highContrastLight?: PlotlyTemplate };

function getPlotlyTemplate(kind: vscode.ColorThemeKind, scope?: vscode.ConfigurationScope): PlotlyTemplate {
    let systemTemplate: PlotlyTemplate;
    let userTemplate: PlotlyTemplate | undefined;

    const userTemplates = vscode.workspace.getConfiguration('spec-data.preview.plot', scope).get<UserPlotlyTemplates>('templates');

    switch (kind) {
        case vscode.ColorThemeKind.Dark:
            systemTemplate = plotTemplate.dark;
            userTemplate = userTemplates?.dark;
            break;
        case vscode.ColorThemeKind.HighContrast:
            systemTemplate = plotTemplate.highContast;
            userTemplate = userTemplates?.highContrast;
            break;
        case vscode.ColorThemeKind.HighContrastLight:
            systemTemplate = plotTemplate.highContrastLight;
            userTemplate = userTemplates?.highContrastLight;
            break;
        default:
            systemTemplate = plotTemplate.light;
            userTemplate = userTemplates?.light;
    }

    if (userTemplate) {
        return merge({}, systemTemplate, userTemplate);
    } else {
        return merge({}, systemTemplate);
    }
}
