import * as vscode from 'vscode';
import { TextDecoder } from 'util';
import plotTemplate from './plotTemplate';
import merge = require('lodash.merge');

const SELECTOR = { scheme: 'file', language: 'spec-data' };

type Node = FileNode | DateNode | CommentNode | NameListNode | ValueListNode | ScanHeadNode | ScanDataNode | UnknownNode;
interface BaseNode { type: string, lineStart: number, lineEnd: number, occurance?: number }
interface FileNode extends BaseNode { type: 'file', value: string }
interface DateNode extends BaseNode { type: 'date', value: string }
interface CommentNode extends BaseNode { type: 'comment', value: string }
interface NameListNode extends BaseNode { type: 'nameList', kind: string, values: string[], mnemonic: boolean }
interface ValueListNode extends BaseNode { type: 'valueList', kind: string, values: number[] }
interface ScanHeadNode extends BaseNode { type: 'scanHead', index: number, code: string }
interface ScanDataNode extends BaseNode { type: 'scanData', rows: number, headers: string[], data?: number[][] }
interface UnknownNode extends BaseNode { type: 'unknown', kind: string, value: string }

interface Preview { uri: vscode.Uri, panel: vscode.WebviewPanel, tree?: Node[] }

/**
 * Provider class for "spec-data" language
 */
export class DataProvider implements vscode.FoldingRangeProvider, vscode.DocumentSymbolProvider, vscode.WebviewPanelSerializer {
    readonly extensionUri: vscode.Uri;
    readonly subscriptions: { dispose(): any }[];
    readonly previews: Preview[] = [];

    livePreview: Preview | undefined = undefined;
    colorThemeKind: vscode.ColorThemeKind;
    onDidChangeTextEditorVisibleRangesDisposable: vscode.Disposable | undefined;

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
                this.showPreview(uris[uris.length - 1], true, false);
            }
        };

        // callback of 'spec-data.showPreviewToSide'.
        const showLockedPreviewCallback = async (...args: unknown[]) => {
            for (const uri of getTargetFileUris(args)) {
                this.showPreview(uri, false, true);
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
                this.updatePreview(activePreview);
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
                    activePreview.panel.webview.postMessage({ command: 'lockPreview', flag: true });
                    activePreview.panel.title = `[Preview] ${filePath.substring(filePath.lastIndexOf('/') + 1)}`;
                } else {
                    // If the active view is not a live preview...
                    if (this.livePreview) {
                        // close the previous live view if it exists...
                        this.livePreview.panel.dispose();
                    }
                    // and set the active view to live view.
                    this.livePreview = activePreview;
                    activePreview.panel.webview.postMessage({ command: 'lockPreview', flag: false });
                    activePreview.panel.title = `Preview ${filePath.substring(filePath.lastIndexOf('/') + 1)}`;
                }
            } else {
                vscode.window.showErrorMessage('Failed in finding active preview tab.');
            }
        };

        const onDidChangeActiveTextEditorListner = (editor: vscode.TextEditor | undefined) => {
            if (editor && editor.document.languageId === 'spec-data' && editor.document.uri.scheme === 'file') {
                if (this.livePreview && this.livePreview.uri.toString() !== editor.document.uri.toString()) {
                    this.livePreview.uri = editor.document.uri;
                    this.updatePreview(this.livePreview, editor.document.getText());
                }
            }
        };

        const onDidChangeTextEditorVisibleRangesListener = (event: vscode.TextEditorVisibleRangesChangeEvent) => {
            if (event.visibleRanges.length) {
                const line = event.visibleRanges[0].start.line;
                const preview = this.previews.find(preview => preview.uri.toString() === event.textEditor.document.uri.toString());
                if (preview && preview.tree) {
                    const node = preview.tree.find(node => (node.lineEnd >= line));
                    if (node) {
                        preview.panel.webview.postMessage({ command: 'scrollToElement', elementId: `l${node.lineStart}` });
                    }
                }
            }
        };

        const onDidChangeConfigurationListner = (event: vscode.ConfigurationChangeEvent) => {
            if (event.affectsConfiguration('spec-data.preview.scrollPreviewWithEditor')) {
                const scrollPreviewWithEditor: boolean = vscode.workspace.getConfiguration('spec-data.preview').get('scrollPreviewWithEditor', true);
                if (scrollPreviewWithEditor) {
                    if (!this.onDidChangeTextEditorVisibleRangesDisposable) {
                        this.onDidChangeTextEditorVisibleRangesDisposable = vscode.window.onDidChangeTextEditorVisibleRanges(onDidChangeTextEditorVisibleRangesListener);
                        context.subscriptions.push(this.onDidChangeTextEditorVisibleRangesDisposable);
                    }
                } else {
                    if (this.onDidChangeTextEditorVisibleRangesDisposable) {
                        const index = context.subscriptions.indexOf(this.onDidChangeTextEditorVisibleRangesDisposable);
                        if (index >= 0) {
                            context.subscriptions.splice(index, 1);
                        }
                        this.onDidChangeTextEditorVisibleRangesDisposable.dispose();
                    };
                    this.onDidChangeTextEditorVisibleRangesDisposable = undefined;
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
                    preview.panel.webview.postMessage({
                        command: 'setTemplate',
                        template: getPlotlyTemplate(colorTheme.kind),
                        action: 'update'
                    });
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
            vscode.commands.registerCommand('spec-data.togglePreviewLock', togglePreviewLockCallback),
            vscode.languages.registerFoldingRangeProvider(SELECTOR, this),
            vscode.languages.registerDocumentSymbolProvider(SELECTOR, this),
            vscode.window.registerWebviewPanelSerializer('specDataPreview', this),
            vscode.window.onDidChangeActiveTextEditor(onDidChangeActiveTextEditorListner),
            vscode.window.onDidChangeActiveColorTheme(activeColorThemeChangeListener),
            vscode.workspace.onDidChangeConfiguration(onDidChangeConfigurationListner)
        );

        const scrollPreviewWithEditor: boolean = vscode.workspace.getConfiguration('spec-data.preview').get('scrollPreviewWithEditor', true);
        if (scrollPreviewWithEditor) {
            this.onDidChangeTextEditorVisibleRangesDisposable = vscode.window.onDidChangeTextEditorVisibleRanges(onDidChangeTextEditorVisibleRangesListener);
            context.subscriptions.push(this.onDidChangeTextEditorVisibleRangesDisposable);
        }
    }

    /**
     * Required implementation of vscode.FoldingRangeProvider
     */
    public provideFoldingRanges(document: vscode.TextDocument, context: vscode.FoldingContext, token: vscode.CancellationToken): vscode.ProviderResult<vscode.FoldingRange[]> {
        if (token.isCancellationRequested) { return; }

        const lineCount = document.lineCount;
        const ranges: vscode.FoldingRange[] = [];
        let prevLineIndex = -1;

        for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
            if (document.lineAt(lineIndex).isEmptyOrWhitespace) {
                if (lineIndex === prevLineIndex + 1) {
                } else {
                    ranges.push(new vscode.FoldingRange(prevLineIndex + 1, lineIndex));
                }
                prevLineIndex = lineIndex;
            }
        }
        return ranges;
    }

    /**
     * Required implementation of vscode.DocumentSymbolProvider
     */
    public provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
        if (token.isCancellationRequested) { return; }

        const lineCount = document.lineCount;
        const results: vscode.DocumentSymbol[] = [];
        const scanLineRegex = /^(#S [0-9]+)\s*(\S.*)?$/;
        const otherLineRegex = /^(#[a-zA-Z][0-9]*)\s(\S.*)?$/;
        let prevLineIndex = -1;

        for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
            const line = document.lineAt(lineIndex);
            if (line.isEmptyOrWhitespace) {
                if (lineIndex !== prevLineIndex + 1) {
                    const lineAtBlockStart = document.lineAt(prevLineIndex + 1);
                    let matched: RegExpMatchArray | null;
                    if ((matched = lineAtBlockStart.text.match(scanLineRegex)) || (matched = lineAtBlockStart.text.match(otherLineRegex))) {
                        const range = new vscode.Range(prevLineIndex + 1, 0, lineIndex, 0);
                        const selectedRange = new vscode.Range(prevLineIndex + 1, 0, prevLineIndex + 1, matched[0].length);
                        results.push(new vscode.DocumentSymbol(matched[1], matched[2], vscode.SymbolKind.Key, range, selectedRange));
                    }
                }
                prevLineIndex = lineIndex;
            }
        }
        return results;
    }

    /**
     * Required implementation of vscode.WebviewPanelSerializer
     */
    public async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: any) {
        if (state) {
            this.initPreview(panel, vscode.Uri.parse(state.sourceUri), state.lockPreview);
        } else {
            const message = 'Unable to restore the preview content because the previous state is not recorded. Probably the content had not been displayed at all in the previous session. The tab will be closed.';
            vscode.window.showErrorMessage(message, 'OK').then(() => panel.dispose());
        }
    }

    private async showPreview(sourceUri: vscode.Uri, showToSide = false, lockPreview = false) {
        if (!vscode.workspace.isTrusted) {
            vscode.window.showErrorMessage('Preview feature is disabled in untrusted workspaces.');
            return;
        }

        if (!lockPreview && this.livePreview) {
            // If a live preview panel exists and new panel is not locked...
            if (this.livePreview.uri.toString() !== sourceUri.toString()) {
                // Update the content if the URLs are different.
                this.livePreview.uri = sourceUri;
                this.updatePreview(this.livePreview);
            }
            this.livePreview.panel.reveal();
            return this.livePreview;
        } else {
            // Else create a new panel as a live panel.
            const config = vscode.workspace.getConfiguration('spec-data.preview');
            const retainContextWhenHidden: boolean = config.get('retainContextWhenHidden', false);
            const panel = vscode.window.createWebviewPanel(
                'specDataPreview',
                'Preview spec data',
                showToSide ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active,
                {
                    // localResourceRoots: [this.extensionUri],
                    enableScripts: true,
                    retainContextWhenHidden: retainContextWhenHidden,
                }
            );
            return this.initPreview(panel, sourceUri, lockPreview);
        }
    }

    private async initPreview(panel: vscode.WebviewPanel, uri: vscode.Uri, lockPreview = false) {
        const preview: Preview = { uri, panel };
        this.previews.push(preview);
        if (!lockPreview) {
            this.livePreview = preview;
        }

        panel.onDidDispose(() => {
            vscode.commands.executeCommand('setContext', 'spec-data.previewEditorActive', false);
            // remove the closed preview from the array.
            const index = this.previews.findIndex(preview => preview.panel === panel);
            if (index >= 0) {
                this.previews.splice(index, 1);
            }

            // clear the live preview reference if the closed preview is the live preview.
            if (this.livePreview && this.livePreview.panel === panel) {
                this.livePreview = undefined;
            }
        }, null, this.subscriptions);

        panel.onDidChangeViewState((event) => {
            vscode.commands.executeCommand('setContext', 'spec-data.previewEditorActive', event.webviewPanel.active);
        }, null, this.subscriptions);

        panel.webview.onDidReceiveMessage(message => {
            // console.log(message);
            if (message.command === 'requestPlotData') {
                this.replyPlotRequest(preview, message.occurance, message.indexes, message.action);
            } else if (message.command === 'requestTemplate') {
                panel.webview.postMessage({
                    command: 'setTemplate',
                    template: getPlotlyTemplate(),
                    action: message.action
                });
            }
        }, undefined, this.subscriptions);

        this.updatePreview(preview).then(() => {
            preview.panel.webview.postMessage({ command: 'lockPreview', flag: lockPreview });
        });

        return preview;
    }

    private async updatePreview(preview: Preview, text?: string) {
        if (!vscode.workspace.isTrusted) {
            vscode.window.showErrorMessage('Preview feature is disabled in untrusted workspaces.');
            return false;
        }

        if (!text) {
            const document = vscode.workspace.textDocuments.find(document => document.uri.toString() === preview.uri.toString());
            if (document) {
                text = document.getText();
            } else {
                text = new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(preview.uri));
            }
        }

        // first, parse the document contents. Simultaneously load the contents if the file is not yet opened.
        const tree = parseScanFileContent(text);
        if (!tree) {
            vscode.window.showErrorMessage('Failed in parsing the document.');
            return false;
        }

        const webview = preview.panel.webview;
        const label = (this.livePreview && this.livePreview === preview) ? 'Preview' : '[Preview]';
        const plotlyJsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'node_modules', 'plotly.js-dist-min', 'plotly.min.js'));
        const controllerJsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'out', 'previewController.js'));

        preview.tree = tree;
        preview.panel.title = `${label} ${preview.uri.path.substring(preview.uri.path.lastIndexOf('/') + 1)}`;
        preview.panel.webview.html = getWebviewContent(webview.cspSource, preview.uri, plotlyJsUri, controllerJsUri, tree);

        return true;
    }

    private replyPlotRequest(preview: Preview, occurance: number, indexes: [number, number], action: string) {
        if (preview.tree) {
            const node = preview.tree.find(node => node.occurance === occurance && node.type === 'scanData');
            if (node && node.type === 'scanData' && node.data && node.data.length) {
                const data = node.data;
                const xIndex = (indexes[0] === -1) ? node.headers.length - 1 : indexes[0];
                const yIndex = (indexes[1] === -1) ? node.headers.length - 1 : indexes[1];
                if (xIndex >= 0 && xIndex < data.length && yIndex >= 0 && yIndex < data.length) {
                    preview.panel.webview.postMessage({
                        command: 'updatePlot',
                        elementId: `plotly${occurance}`,
                        data: [{ x: data[xIndex], y: data[yIndex] }],
                        labels: [node.headers[xIndex], node.headers[yIndex]],
                        action: action
                    });
                }
            }
        }
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

function parseScanFileContent(text: string): Node[] | undefined {
    const lines = text.split('\n');
    const lineCount = lines.length;

    const fileRegex = /^(#F) (.*)$/;
    const dateRegex = /^(#D) (.*)$/;
    const commentRegex = /^(#C) (.*)$/;
    const nameListRegex = /^(?:#([OJoj])([0-9]+)) (.*)$/;
    const valueListRegex = /^(?:#([P])([0-9]+)) (.*)$/;
    const scanHeadRegex = /^(#S) ([0-9]+) (.*)$/;
    const scanNumberRegex = /^(#N) ([0-9]+)$/;
    const scanDataRegex = /^(#L) (.*)$/;
    const allRegex = /^#([a-zA-Z][0-9]*) (.*)$/;
    const emptyLineRegex = /^\s*$/;

    let matched: RegExpMatchArray | null;
    let prevNodeIndex = -1;
    let rowNumber = 0;
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
        if (matched = lineText.match(fileRegex)) {
            nodes.push({ type: 'file', lineStart: lineIndex, lineEnd: lineIndex, occurance: fileOccurance, value: matched[2] });
            fileOccurance++;
        } else if (matched = lineText.match(dateRegex)) {
            nodes.push({ type: 'date', lineStart: lineIndex, lineEnd: lineIndex, occurance: dateOccurance, value: matched[2] });
            dateOccurance++;
        } else if (matched = lineText.match(commentRegex)) {
            nodes.push({ type: 'comment', lineStart: lineIndex, lineEnd: lineIndex, occurance: commentOccurance, value: matched[2] });
            commentOccurance++;
        } else if (matched = lineText.match(nameListRegex)) {
            let kind, isMnemonic, separator;
            if (matched[1] === matched[1].toLowerCase()) {
                isMnemonic = true;
                separator = ' ';
            } else {
                isMnemonic = false;
                separator = '  ';
            }
            if (matched[1].toLowerCase() === 'o') {
                kind = 'motor';
            } else if (matched[1].toLowerCase() === 'j') {
                kind = 'counter';
            } else {
                kind = matched[1];
            }
            const listIndex = parseInt(matched[2]);
            const prevNode = nodes.length > 0 ? nodes[nodes.length - 1] : undefined;
            if (prevNode && prevNode.type === 'nameList' && prevNode.kind === kind && prevNode.mnemonic === isMnemonic) {
                if (prevNodeIndex !== listIndex - 1) {
                    vscode.window.showErrorMessage(`Inconsequent index of the name list: line ${lineIndex + 1}`);
                    return undefined;
                }
                prevNode.values.push(...(matched[3].trimEnd().split(separator)));
                prevNode.lineEnd = lineIndex;
                prevNodeIndex = listIndex;
            } else {
                if (listIndex !== 0) {
                    vscode.window.showErrorMessage(`The name list not starding with 0: line ${lineIndex + 1}`);
                    return undefined;
                }
                nodes.push({ type: 'nameList', lineStart: lineIndex, lineEnd: lineIndex, kind: kind, values: matched[3].trimEnd().split(separator), mnemonic: isMnemonic });
                prevNodeIndex = 0;
            }
        } else if (matched = lineText.match(valueListRegex)) {
            let kind;
            if (matched[1] === 'P') {
                kind = 'motor';
            } else {
                kind = matched[1];
            }
            const listIndex = parseInt(matched[2]);
            const prevNode = nodes.length > 0 ? nodes[nodes.length - 1] : undefined;
            if (prevNode && prevNode.type === 'valueList' && prevNode.kind === kind) {
                if (prevNodeIndex !== listIndex - 1) {
                    vscode.window.showErrorMessage(`Inconsequent index of the value list: line ${lineIndex + 1}`);
                    return undefined;
                }
                prevNode.values.push(...(matched[3].trimEnd().split(' ').map(value => parseFloat(value))));
                prevNode.lineEnd = lineIndex;
                prevNodeIndex = listIndex;
            } else {
                if (listIndex !== 0) {
                    vscode.window.showErrorMessage(`The value list not starding with 0: line ${lineIndex + 1}`);
                    return undefined;
                }
                nodes.push({ type: 'valueList', lineStart: lineIndex, lineEnd: lineIndex, occurance: valueListOccuracne, kind: kind, values: matched[3].trimEnd().split(' ').map(value => parseFloat(value)) });
                valueListOccuracne++;
                prevNodeIndex = 0;
            }
        } else if (matched = lineText.match(scanHeadRegex)) {
            nodes.push({ type: 'scanHead', lineStart: lineIndex, lineEnd: lineIndex, occurance: scanHeadOccurance, index: parseInt(matched[2]), code: matched[3] });
            scanHeadOccurance++;
        } else if (matched = lineText.match(scanNumberRegex)) {
            rowNumber = parseInt(matched[2]);
        } else if (matched = lineText.match(scanDataRegex)) {
            // The separator between motors and counters are 4 whitespaces.
            // The separator between respective motors and counters are 2 whitespaces.
            const headersMotCnt = matched[2].split('    ', 2);
            const headers = headersMotCnt.map(a => a.split('  ')).reduce((a, b) => a.concat(b));
            if (headers.length !== rowNumber) {
                vscode.window.showErrorMessage(`Scan number mismatched (header): line ${lineIndex + 1}`);
                return undefined;
            }
            const dataNode: ScanDataNode = { type: 'scanData', lineStart: lineIndex, lineEnd: lineIndex, occurance: scanDataOccurance, rows: rowNumber, headers: headers };
            nodes.push(dataNode);
            scanDataOccurance++;

            // read succeeding lines until EOF or non-data line.
            const data: number[][] = [];
            for (; lineIndex + 1 < lineCount; lineIndex++) {
                const blockLineText = lines[lineIndex + 1];
                if (blockLineText.match(allRegex) || blockLineText.match(emptyLineRegex)) {
                    break;
                }
                // The separator between motors and counters are 2 whitespaces.
                // The separator between respective motors and counters are 1 whitespace.
                const rowsMotCnt = blockLineText.split('  ', 2);
                const rows = rowsMotCnt.map(a => a.split(' ')).reduce((a, b) => a.concat(b));
                if (rows.length !== rowNumber) {
                    vscode.window.showErrorMessage(`Scan number mismatched (data): line ${lineIndex + 2}`);
                    return undefined;
                }
                data.push(rows.map(item => parseFloat(item)));
            }
            // transpose 2D array
            if (data.length > 0) {
                dataNode.data = data[0].map((_, colIndex) => data.map(row => row[colIndex]));
            }
            dataNode.lineEnd = lineIndex;
        } else if (matched = lineText.match(allRegex)) {
            nodes.push({ type: 'unknown', lineStart: lineIndex, lineEnd: lineIndex, kind: matched[1], value: matched[2] });
        }
    }
    return nodes;
}

function getWebviewContent(cspSource: string, sourceUri: vscode.Uri, plotlyJsUri: vscode.Uri, controllerJsJri: vscode.Uri, nodes: Node[]): string {
    let nameLists: { [name: string]: string[] } = {};
    let mnemonicLists: { [name: string]: string[] } = {};

    const config = vscode.workspace.getConfiguration('spec-data.preview');
    const hideTable: boolean = config.get('table.hide', true);
    const columnsPerLine: number = config.get('table.columnsPerLine', 8);
    const headerType: string = config.get('table.headerType', 'mnemonic');
    const maximumPlots: number = config.get('plot.maximumNumberOfPlots', 25);
    const plotHeight: number = config.get('plot.height', 400);
    const applyCsp: boolean = config.get('applyContentSecurityPolicy', true);

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
    };

    let header = `<!DOCTYPE html>
<html lang="en">
<head data-maximum-plots="${maximumPlots}" data-plot-height="${plotHeight}" data-hide-table="${Number(hideTable)}" data-source-uri="${sourceUri.toString()}">
	<meta charset="UTF-8">
`;
    if (applyCsp) {
        header += `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https:; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-eval';">
`;
    }
    header += `<title>Preview spec scan</title>
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="${plotlyJsUri}"></script>
    <script src="${controllerJsJri}"></script>
</head>
<body>
`;

    let body = "";
    for (const node of nodes) {
        if (node.type === 'file') {
            body += `<h1 ${getAttributesForNode(node)}>File: ${getSanitizedString(node.value)}</h1>`;
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
            const data: number[][] | undefined = node.data;
            const headers = node.headers;
            const occurance = node.occurance;

            body += `<div ${getAttributesForNode(node)}>`;
            if (data && data.length) {
                body += `<p>
<input type="checkbox" id="showPlotInput${occurance}" class="showPlotInput">
<label for="showPlotInput${occurance}">Show Scan Plot</label>, `;
                const axes = ['x', 'y'];
                for (let j = 0; j < axes.length; j++) {
                    const axis = axes[j];
                    body += `<label for="axisSelect${axis.toUpperCase()}${occurance}">${axis}:</label>
    <select id="axisSelect${axis.toUpperCase()}${occurance}" class="axisSelect" data-axis="${axis}">`;
                    body += headers.map(item => `<option>${getSanitizedString(item)}</option>`).join('');
                    body += `</select>`;
                    if (j !== axes.length - 1) {
                        body += ', ';
                    }
                }
                body += `</p>
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

type PlotlyTemplate = { data?: object[], layout?: object };
type UserPlotlyTemplate = { all?: PlotlyTemplate, light?: PlotlyTemplate, dark?: PlotlyTemplate, highContrast?: PlotlyTemplate };

function getPlotlyTemplate(kind?: vscode.ColorThemeKind): PlotlyTemplate {
    if (kind === undefined) {
        kind = vscode.window.activeColorTheme.kind;
    }

    let systemTemplate: PlotlyTemplate;
    let userTemplateForAllThemes: PlotlyTemplate;
    let userTemplateForTheme: PlotlyTemplate;

    const userTemplate: UserPlotlyTemplate | undefined = vscode.workspace.getConfiguration('spec-data.preview').get('plot.template');

    userTemplateForAllThemes = (userTemplate && userTemplate.all) ? userTemplate.all : {};

    switch (kind) {
        case vscode.ColorThemeKind.Dark:
            systemTemplate = plotTemplate.dark;
            userTemplateForTheme = (userTemplate && userTemplate.dark) ? userTemplate.dark : {};
            break;
        case vscode.ColorThemeKind.HighContrast:
            systemTemplate = plotTemplate.highContast;
            userTemplateForTheme = (userTemplate && userTemplate.highContrast) ? userTemplate.highContrast : {};
            break;
        default:
            systemTemplate = plotTemplate.light;
            userTemplateForTheme = (userTemplate && userTemplate.light) ? userTemplate.light : {};
    }

    return merge({}, systemTemplate, userTemplateForAllThemes, userTemplateForTheme);
}
