import * as vscode from 'vscode';
import { defaultTraceTemplate, defaultLayoutTemplate } from './previewTemplates';
import { parseDocument, parseTextFromUri, SPEC_DATA_FILTER, DPPMCA_FILTER, DOCUMENT_SELECTOR } from './dataParser';
import type { ParsedData, Node } from './dataParser';

// @types/plotly.js contains DOM objects and thus
// `tsc -p .` fails without `skipLibCheck`.
import type { PlotData, Layout } from 'plotly.js-basic-dist-min';
// type PlotData = any;
// type Layout = any;
import type { State, MessageToWebview, MessageFromWebview } from './previewTypes';

type Preview = {
    readonly panel: vscode.WebviewPanel;
    uri: vscode.Uri;
    enableMultipleSelection: boolean;
    enableRightAxis: boolean;
    nodes?: Node[];
};

type ParserSession = {
    promise: Promise<ParsedData | undefined>,
    tokenSource: vscode.CancellationTokenSource | undefined,
};

/**
 * Provider class for "spec-data" language.
 */
export class DataProvider implements vscode.FoldingRangeProvider, vscode.DocumentSymbolProvider, vscode.WebviewPanelSerializer<State> {
    readonly extensionUri;
    readonly subscriptions;
    readonly previews: Preview[] = [];
    readonly parserSessionMap: Map<string, ParserSession> = new Map();

    enablePreviewScroll: boolean;
    livePreview: Preview | undefined = undefined;
    colorThemeKind: vscode.ColorThemeKind;

    lastScrollEditorTimeStamp = 0;
    lastScrollPreviewTimeStamp = 0;

    private get activePreview(): Preview | undefined {
        return this.previews.find(preview => preview.panel.active);
    }

    constructor(context: vscode.ExtensionContext) {
        this.extensionUri = context.extensionUri;
        this.subscriptions = context.subscriptions;
        this.colorThemeKind = vscode.window.activeColorTheme.kind;

        const config = vscode.workspace.getConfiguration('spec-data.preview');
        this.enablePreviewScroll = config.get<boolean>('scrollPreviewWithEditor', true);

        // callback of 'spec-data.showPreview'.
        const showPreviewCallback = (...args: unknown[]) => {
            const uris = getTargetFileUris(args);
            if (uris.length) {
                this.showPreview(uris[uris.length - 1], false, false);
            }
        };

        // callback of 'spec-data.showPreviewToSide'.
        const showPreviewToSideCallback = (...args: unknown[]) => {
            const uris = getTargetFileUris(args);
            if (uris.length) {
                this.showPreview(uris[uris.length - 1], false, true);
            }
        };

        // callback of 'spec-data.showLockedPreview'.
        const showLockedPreviewCallback = (...args: unknown[]) => {
            for (const uri of getTargetFileUris(args)) {
                this.showPreview(uri, true, false);
            }
        };

        // callback of 'spec-data.showLockedPreviewToSide'.
        const showLockedPreviewToSideCallback = (...args: unknown[]) => {
            for (const uri of getTargetFileUris(args)) {
                this.showPreview(uri, true, true);
            }
        };

        // callback of 'spec-data.showSource'.
        const showSourceCallback = (..._args: unknown[]) => {
            const activePreview = this.activePreview;
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
        const refreshPreviewCallback = (..._args: unknown[]) => {
            const activePreview = this.activePreview;
            if (activePreview) {
                this.reloadPreview(activePreview, activePreview.uri, true);
            } else {
                vscode.window.showErrorMessage('Failed in finding active preview tab.');
            }
        };

        // callback of 'spec-data.toggleMultipleSelection'.
        const toggleMultipleSelectionCallback = (..._args: unknown[]) => {
            const activePreview = this.activePreview;
            if (activePreview) {
                const flag = !activePreview.enableMultipleSelection;
                activePreview.enableMultipleSelection = flag;
                const messageOut: MessageToWebview = { type: 'enableMultipleSelection', flag: flag };
                activePreview.panel.webview.postMessage(messageOut);
            } else {
                vscode.window.showErrorMessage('Failed in finding active preview tab.');
            }
        };

        // callback of 'spec-data.toggleRightAxis'.
        const toggleRightAxisCallback = (..._args: unknown[]) => {
            const activePreview = this.activePreview;
            if (activePreview) {
                const flag = !activePreview.enableRightAxis;
                activePreview.enableRightAxis = flag;
                const messageOut: MessageToWebview = { type: 'enableRightAxis', flag: flag };
                activePreview.panel.webview.postMessage(messageOut);
            } else {
                vscode.window.showErrorMessage('Failed in finding active preview tab.');
            }
        };

        // callback of 'spec-data.togglePreviewLock'.
        const togglePreviewLockCallback = (..._args: unknown[]) => {
            const activePreview = this.activePreview;
            if (activePreview) {
                const filePath = activePreview.uri.path;
                if (this.livePreview && activePreview === this.livePreview) {
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

        // a hander invoked when the document is opened
        // this is also invoked after the user manually changed the language id
        const textDocumentDidOpenListener = (document: vscode.TextDocument) => {
            if (vscode.languages.match(DOCUMENT_SELECTOR, document)) {
                this.runParserSession(document);
            }
        };

        // a hander invoked when the document is changed
        const textDocumentDidChangeListener = (event: vscode.TextDocumentChangeEvent) => {
            const document = event.document;
            if (vscode.languages.match(DOCUMENT_SELECTOR, document)) {
                this.runParserSession(document);
            }
        };

        // a hander invoked when the document is closed
        // this is also invoked after the user manually changed the language id
        const textDocumentDidCloseListener = (document: vscode.TextDocument) => {
            if (vscode.languages.match(DOCUMENT_SELECTOR, document)) {
                this.parserSessionMap.delete(document.uri.toString());
            }
        };

        const activeTextEditorChangeListener = (editor: vscode.TextEditor | undefined) => {
            if (editor) {
                const document = editor.document;
                if (vscode.languages.match(DOCUMENT_SELECTOR, document) && this.livePreview) {
                    this.reloadPreview(this.livePreview, document.uri, false);
                }
            }
        };

        const textEditorVisibleRangesChangeListener = (event: vscode.TextEditorVisibleRangesChangeEvent) => {
            const now = Date.now();
            const document = event.textEditor.document;
            if (this.enablePreviewScroll && vscode.languages.match(DOCUMENT_SELECTOR, document) && now - this.lastScrollEditorTimeStamp > 1500 && event.visibleRanges.length > 0) {
                // Refrain from sending 'scrollPreview' message soon ( < 1.5 sec) after receiving 'scrollEditor' message.

                const line = event.visibleRanges[0].start.line;
                const previews = this.previews.filter(preview => preview.uri.toString() === document.uri.toString());
                for (const preview of previews) {
                    const node = preview.nodes?.find(node => (node.lineEnd >= line));
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
                const flag = vscode.workspace.getConfiguration('spec-data.preview').get<boolean>('scrollEditorWithPreview', true);
                const messageOut: MessageToWebview = { type: 'enableEditorScroll', flag: flag };
                for (const preview of this.previews) {
                    preview.panel.webview.postMessage(messageOut);
                }
            }
            if (event.affectsConfiguration('spec-data.preview.scrollPreviewWithEditor')) {
                this.enablePreviewScroll = vscode.workspace.getConfiguration('spec-data.preview').get<boolean>('scrollPreviewWithEditor', true);
            }
            if (event.affectsConfiguration('spec-data.preview.smoothScrolling')) {
                const flag = vscode.workspace.getConfiguration('spec-data.preview').get<boolean>('smoothScrolling', true);
                const messageOut: MessageToWebview = { type: 'setScrollBehavior', value: flag ? 'smooth' : 'auto' };
                for (const preview of this.previews) {
                    preview.panel.webview.postMessage(messageOut);
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

        // When the extension is activated by opening a file for this extension.
        for (const document of vscode.workspace.textDocuments) {
            if (vscode.languages.match(DOCUMENT_SELECTOR, document)) {
                this.runParserSession(document);
            }
        }

        // register providers and commands
        context.subscriptions.push(
            vscode.commands.registerCommand('spec-data.showPreview', showPreviewCallback),
            vscode.commands.registerCommand('spec-data.showPreviewToSide', showPreviewToSideCallback),
            vscode.commands.registerCommand('spec-data.showLockedPreview', showLockedPreviewCallback),
            vscode.commands.registerCommand('spec-data.showLockedPreviewToSide', showLockedPreviewToSideCallback),
            vscode.commands.registerCommand('spec-data.showSource', showSourceCallback),
            vscode.commands.registerCommand('spec-data.refreshPreview', refreshPreviewCallback),
            vscode.commands.registerCommand('spec-data.toggleMultipleSelection', toggleMultipleSelectionCallback),
            vscode.commands.registerCommand('spec-data.toggleRightAxis', toggleRightAxisCallback),
            vscode.commands.registerCommand('spec-data.togglePreviewLock', togglePreviewLockCallback),
            vscode.languages.registerFoldingRangeProvider([SPEC_DATA_FILTER, DPPMCA_FILTER], this),
            vscode.languages.registerDocumentSymbolProvider([SPEC_DATA_FILTER, DPPMCA_FILTER], this),
            vscode.window.registerWebviewPanelSerializer('spec-data.preview', this),
            vscode.workspace.onDidOpenTextDocument(textDocumentDidOpenListener),
            vscode.workspace.onDidChangeTextDocument(textDocumentDidChangeListener),
            vscode.workspace.onDidCloseTextDocument(textDocumentDidCloseListener),
            vscode.window.onDidChangeActiveTextEditor(activeTextEditorChangeListener),
            vscode.window.onDidChangeTextEditorVisibleRanges(textEditorVisibleRangesChangeListener),
            vscode.window.onDidChangeActiveColorTheme(activeColorThemeChangeListener),
            vscode.workspace.onDidChangeConfiguration(configurationChangeListner)
        );
    }

    /**
     * Required implementation of vscode.FoldingRangeProvider
     */
    public provideFoldingRanges(document: vscode.TextDocument, context: vscode.FoldingContext, token: vscode.CancellationToken): vscode.ProviderResult<vscode.FoldingRange[]> {
        if (token.isCancellationRequested) { return; }

        return this.parserSessionMap.get(document.uri.toString())?.promise.then(data => data?.foldingRanges);
    }

    /**
     * Required implementation of vscode.DocumentSymbolProvider
     */
    public provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
        if (token.isCancellationRequested) { return; }

        return this.parserSessionMap.get(document.uri.toString())?.promise.then(data => data?.documentSymbols);
    }

    /**
     * Required implementation of vscode.WebviewPanelSerializer.
     */
    public async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: State): Promise<void> {
        if (!state) {
            const message = 'Unable to restore the preview content because the previous state is not recorded. Probably the content had not been displayed at all in the previous session. The tab will be closed.';
            vscode.window.showErrorMessage(message, 'OK').then(() => panel.dispose());
            return;
        }
        const uri = vscode.Uri.parse(state.sourceUri);
        const parsedData = await this.parseDataOfFileUri(uri);
        if (!parsedData) {
            vscode.window.showErrorMessage(`Failed in parsing the file: ${vscode.workspace.asRelativePath(uri)}.`);
            return;
        }

        const preview: Preview = { panel, uri, enableMultipleSelection: state.enableMultipleSelection, enableRightAxis: state.enableRightAxis, };
        await this.postCreatePreview(preview, parsedData, state.lockPreview);
        return;
    }

    /**
     * Parse document contents.
     * Cancellation token is integrated.
     */
    private runParserSession(document: vscode.TextDocument): void {
        const uriString = document.uri.toString();

        // Create a new update session.
        const tokenSource = new vscode.CancellationTokenSource();
        const promise = new Promise<ParsedData | undefined>(resolve => resolve(parseDocument(document, tokenSource.token)));
        const newSession: ParserSession = { promise, tokenSource };
        newSession.promise.finally(() => {
            // Attach a callback that cleans up the cancellation token when update is finished.
            tokenSource.dispose();
            newSession.tokenSource = undefined;
        });
        // If the previous session exists and it is still running, cancel it.
        this.parserSessionMap.get(uriString)?.tokenSource?.cancel();
        // Update the map object with the latest session.
        this.parserSessionMap.set(uriString, newSession);
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
            // Update the content if the URIs are different.
            await this.reloadPreview(this.livePreview, uri, false);
            this.livePreview.panel.reveal();
            return this.livePreview;
        } else {
            // Else create a new webview panel.
            const parsedData = await this.parseDataOfFileUri(uri);
            if (!parsedData) {
                return vscode.window.showErrorMessage(`Failed in parsing the file: ${vscode.workspace.asRelativePath(uri)}.`);
            }

            const config = vscode.workspace.getConfiguration('spec-data.preview');
            const panel = vscode.window.createWebviewPanel(
                'spec-data.preview',
                'Preview spec data',
                showToSide ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active,
                {
                    // localResourceRoots: [this.extensionUri],
                    enableScripts: true,
                    retainContextWhenHidden: config.get<boolean>('retainContextWhenHidden', false),
                }
            );
            const enableMultipleSelection = config.get<boolean>('plot.enableMultipleSelection', false);
            const enableRightAxis = config.get<boolean>('plot.enableRightAxis', false);
            const preview: Preview = { panel, uri, enableMultipleSelection, enableRightAxis };
            if (showToSide && config.get<boolean>('autoLockGroup', false)) {
                vscode.commands.executeCommand('workbench.action.lockEditorGroup');
            }
            return await this.postCreatePreview(preview, parsedData, lockPreview);
        }
    }

    private async parseDataOfFileUri(uri: vscode.Uri) {
        const uriString = uri.toString();
        return this.parserSessionMap.has(uriString) ?
            await this.parserSessionMap.get(uriString)!.promise :
            await parseTextFromUri(uri);
    }

    /**
     * Register event handlers and then make a content from source.
     * @param preview Preview object created during deserialization process or `showPreview`-type action command.
     * @param parsedData ParsedData object
     * @param lockPreview flag to lock preview with source URI.
     * @returns Preview object if succeeded in parsing a file or `undefined`.
     */
    private async postCreatePreview(preview: Preview, parsedData: ParsedData, lockPreview: boolean) {
        this.previews.push(preview);

        if (!lockPreview) {
            this.livePreview = preview;
        }

        preview.panel.onDidDispose(() => {
            // remove the closed preview from the array.
            const index = this.previews.findIndex(preview2 => preview2.panel === preview.panel);
            if (index >= 0) {
                this.previews.splice(index, 1);
            }

            // clear the live preview reference if the closed preview is the live preview.
            if (this.livePreview?.panel === preview.panel) {
                this.livePreview = undefined;
            }
        }, null, this.subscriptions);

        preview.panel.webview.onDidReceiveMessage((messageIn: MessageFromWebview) => {
            if (messageIn.type === 'scrollEditor') {
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
            } else if (messageIn.type === 'requestPlotData') {
                if (preview.nodes) {
                    let index = 0;
                    const node = preview.nodes.find(node => node.type === 'scanData' && index++ === messageIn.graphNumber);
                    if (node && node.type === 'scanData' && node.data.length) {
                        const { x: xIndex, y1: y1Indexes, y2: y2Indexes } = messageIn.selections;

                        const xData = (xIndex >= 0 && xIndex < node.data.length) ?
                            { label: node.headers[xIndex], array: node.data[xIndex] } :
                            { label: 'point', array: Array(node.data[0].length).fill(0).map((_x, i) => i) };
                        const y1Data = y1Indexes.filter(y_i => y_i < node.data.length).map(y_i => { return { label: node.headers[y_i], array: node.data[y_i] }; });
                        const y2Data = y2Indexes.filter(y_i => y_i < node.data.length).map(y_i => { return { label: node.headers[y_i], array: node.data[y_i] }; });

                        const messageOut: MessageToWebview = {
                            type: 'updatePlot',
                            graphNumber: messageIn.graphNumber,
                            x: xData,
                            y1: y1Data,
                            y2: y2Data,
                            action: messageIn.callback
                        };
                        preview.panel.webview.postMessage(messageOut);
                    }
                }
            } else if (messageIn.type === 'contentLoaded') {
                // This will be called not only when the webview is created but also when it is revealed after it is hidden.
                const config = vscode.workspace.getConfiguration('spec-data.preview');
                let messageOut: MessageToWebview;

                messageOut = { type: 'lockPreview', flag: this.livePreview?.panel !== preview.panel };
                preview.panel.webview.postMessage(messageOut);

                messageOut = { type: 'enableEditorScroll', flag: config.get<boolean>('scrollEditorWithPreview', true) };
                preview.panel.webview.postMessage(messageOut);

                messageOut = {
                    type: 'setTemplate',
                    template: getPlotlyTemplate(vscode.window.activeColorTheme.kind, preview.uri),
                    callback: 'newPlot'
                };
                preview.panel.webview.postMessage(messageOut);

                messageOut = { type: 'setScrollBehavior', value: config.get<boolean>('smoothScrolling', true) ? 'smooth' : 'auto' };
                preview.panel.webview.postMessage(messageOut);

                messageOut = { type: 'restoreScroll', delay: true };
                preview.panel.webview.postMessage(messageOut);
            }
        }, null, this.subscriptions);

        this.updatePreviewWithNodes(preview, parsedData.language, parsedData.nodes);

        return preview;
    }

    /**
     * Reuse the panel in `preview` and update a content from source if the URI is changed.
     * @param preview Preview object
     * @param source URI or document.
     * @param forcesReload Flag whether the preview should be reloaded regardless of the source URI.
     * @returns Preview object if successfully reloaded, else `undefined`.
     */
    private async reloadPreview(preview: Preview, uri: vscode.Uri, forcesReload = false): Promise<Preview | undefined> {
        // If the source URI is the same as the preview URI, do not reload.
        if (forcesReload === false && preview.uri.toString() === uri.toString()) {
            return preview;
        }

        const parsedData = await this.parseDataOfFileUri(uri);
        if (!parsedData) {
            vscode.window.showErrorMessage(`Failed in parsing the file: ${vscode.workspace.asRelativePath(uri)}.`);
            return undefined;
        }

        preview.uri = uri;
        this.updatePreviewWithNodes(preview, parsedData.language, parsedData.nodes);
        return preview;
    }

    private updatePreviewWithNodes(preview: Preview, language: string, nodes: Node[]) {
        const webview = preview.panel.webview;
        const label = this.livePreview === preview ? 'Preview' : '[Preview]';
        const plotlyUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'preview', 'node_modules', 'plotly.js-basic-dist-min', 'plotly-basic.min.js'));
        const controllerUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'preview', 'previewController.js'));

        preview.nodes = nodes;
        preview.panel.title = `${label} ${preview.uri.path.substring(preview.uri.path.lastIndexOf('/') + 1)}`;
        preview.panel.webview.html = getWebviewContent(preview, webview.cspSource, plotlyUri, controllerUri, language);
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


function getWebviewContent(preview: Preview, cspSource: string, plotlyUri: vscode.Uri, controllerUri: vscode.Uri, languageId: string): string {
    if (!preview.nodes) { return ''; }

    const nameLists: { [name: string]: string[] } = {};
    const mnemonicLists: { [name: string]: string[] } = {};

    const config = vscode.workspace.getConfiguration('spec-data.preview', { languageId, uri: preview.uri });
    const hideTable = config.get<boolean>('table.hide', true);
    const columnsPerLine = config.get<number>('table.columnsPerLine', 8);
    const headerType = config.get<string>('table.headerType', 'Mnemonic');
    const maximumPlots = config.get<number>('plot.maximumNumberOfPlots', 25);
    const plotHeight = config.get<number>('plot.height', 400);

    // Apply CSP regardless of user settings when in untrusted workspaces.
    const metaCspStr = !vscode.workspace.isTrusted || config.get<boolean>('applyContentSecurityPolicy', true)
        ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob:; style-src 'unsafe-inline'; script-src ${cspSource};">`
        : '';

    function getSanitizedString(text: string) {
        // const charactersReplacedWith = ['&amp;', '&lt;', '&gt;', '&quot;', '&#39;'];
        // return text.replace(/[&<>"']/g, (match) => charactersReplacedWith['&<>"\''.indexOf(match)]);
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function getAttributesForNode(node: Node) {
        return `id="l${node.lineStart}" class="${node.type}"`;
    }

    /** create components to select arrays (<select>) and select log-linear <input> */
    function getAxisSelectAndOptions(axis: string, headers: string[], size: number, useLogInput: boolean, hidden: boolean) {
        const hiddenStr = hidden === true ? ' hidden' : '';
        const sizeStr = size !== undefined ? ` data-size-for-multiple="${size}"` : '';
        // const multipleStr = isMultiple ? ` multiple size="${size}"` : '';
        let tmpStr;
        tmpStr = `<span class="${axis}"${hiddenStr}>; </span>
<label class="${axis}"${hiddenStr}>
<var>${axis}</var>:
<select class="${axis} ${axis}AxisSelect"${hiddenStr}${sizeStr}>
`;
        tmpStr += headers.map((item, index) => `<option value="${index}">${getSanitizedString(item)}</option>`).join('\n');
        tmpStr += `</select>
</label>
`;
        if (useLogInput) {
            tmpStr += `<span class="${axis}"${hiddenStr}>,</span>
<label class="${axis}"${hiddenStr}>
<input type="checkbox" class="${axis} ${axis}LogInput"${hiddenStr}>
log
</label>
`;
        }

        return tmpStr;
    }

    const header = `<!DOCTYPE html>
<html lang="en">
<head data-maximum-plots="${maximumPlots}" data-plot-height="${plotHeight}" data-hide-table="${Number(hideTable)}" data-source-uri="${preview.uri.toString()}" data-enable-multiple-selection="${Number(preview.enableMultipleSelection)}" data-enable-right-axis="${Number(preview.enableRightAxis)}">
	<meta charset="UTF-8">
    ${metaCspStr}
    <title>Preview of spec-data</title>
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="${plotlyUri}" defer></script>
    <script src="${controllerUri}" defer></script>
</head>
<body>
`;

    const lines: string[] = [];
    for (const node of preview.nodes) {
        if (node.type === 'file') {
            lines.push(`<h1 ${getAttributesForNode(node)}>${getSanitizedString(node.value)}</h1>`);
        } else if (node.type === 'date') {
            lines.push(`<p ${getAttributesForNode(node)}>Date: ${getSanitizedString(node.value)}</p>`);
        } else if (node.type === 'comment') {
            lines.push(`<p ${getAttributesForNode(node)}>Comment: ${getSanitizedString(node.value)}</p>`);
        } else if (node.type === 'nameList') {
            if (node.mnemonic) {
                mnemonicLists[node.kind] = node.values.map(value => getSanitizedString(value));
            } else {
                nameLists[node.kind] = node.values.map(value => getSanitizedString(value));
            }
        } else if (node.type === 'scanHead') {
            lines.push(`<h2 ${getAttributesForNode(node)}>Scan ${node.index}: <code>${getSanitizedString(node.code)}</code></h2>`);
        } else if (node.type === 'valueList') {
            const valueList = node.values;
            const headerList = (headerType === 'Name') ? nameLists['motor'] : (headerType === 'Mnemonic') ? mnemonicLists['motor'] : undefined;
            lines.push(`<div ${getAttributesForNode(node)}>`);
            if (headerList && (headerList.length !== valueList.length)) {
                lines.push('<p><em>The number of scan headers and data columns mismatched.</em></p>');
            } else {
                lines.push(`<p>
<label>
<input type="checkbox" class="showValueListInput">
Show Prescan Table
</label>
</p>
<table class="valueListTable">
<caption>${getSanitizedString(node.kind)}</caption>`);
                for (let row = 0; row < Math.ceil(valueList.length / columnsPerLine); row++) {
                    if (headerList) {
                        const headerListInRow = headerList.slice(row * columnsPerLine, Math.min((row + 1) * columnsPerLine, headerList.length));
                        lines.push(`<tr>${headerListInRow.map(item => `<td><strong>${item}</td></strong>`).join('')}</tr>`);
                    }
                    const valueListInRow = valueList.slice(row * columnsPerLine, Math.min((row + 1) * columnsPerLine, valueList.length));
                    lines.push(`<tr>${valueListInRow.map(item => `<td>${item}</td>`).join('')}</tr>`);
                }
                lines.push(`</table>`);
            }
            lines.push(`</div>`);
        } else if (node.type === 'scanData') {
            const data = node.data;
            const headers = node.headers;

            lines.push(`<div ${getAttributesForNode(node)}>`);
            if (data.length) {
                lines.push(`<p>
<label>
<input type="checkbox" class="showPlotInput">
Show Plot
</label>`);
                const size = Math.min((node.xAxisSelectable ? headers.length + 1 : headers.length), 4);
                lines.push(getAxisSelectAndOptions('x', [...headers, '[point]'], size, false, !node.xAxisSelectable));
                lines.push(getAxisSelectAndOptions('y1', headers, size, true, false));
                lines.push(getAxisSelectAndOptions('y2', [...headers, '[none]'], size, true, !preview.enableRightAxis));
                lines.push(`.</p>
<div class="graphDiv"></div>`);
            }
            lines.push(`</div>`);
            // } else if (node.type === 'unknown') {
            //     lines.push(`<p>#${node.kind} ${node.value}</p>`);
        }
    }

    return header + lines.join('\n') + `</body>
    </html>`;
}

type ColorThemeKind = 'light' | 'dark' | 'highContrast' | 'highContrastLight';

function getPlotlyTemplate(kind: vscode.ColorThemeKind, scope?: vscode.ConfigurationScope) {
    let traceTemplate: Partial<PlotData>[]; // Record<string, unknown>[];
    let layoutTemplate: Partial<Layout>; // Record<string, unknown>;

    const config = vscode.workspace.getConfiguration('spec-data.preview.plot', scope);
    const userTraceTemplate = config.get<{ [key in ColorThemeKind]?: Partial<PlotData>[] }>('traceTemplate');
    const userLayoutTemplate = config.get<{ [key in ColorThemeKind]?: Partial<Layout> }>('layoutTemplate');

    switch (kind) {
        case vscode.ColorThemeKind.Light:
            traceTemplate = userTraceTemplate?.light ?? defaultTraceTemplate.light;
            layoutTemplate = userLayoutTemplate?.light ?? defaultLayoutTemplate.light;
            break;
        case vscode.ColorThemeKind.Dark:
            traceTemplate = userTraceTemplate?.dark ?? defaultTraceTemplate.dark;
            layoutTemplate = userLayoutTemplate?.dark ?? defaultLayoutTemplate.dark;
            break;
        case vscode.ColorThemeKind.HighContrast:
            traceTemplate = userTraceTemplate?.highContrast ?? defaultTraceTemplate.highContrast;
            layoutTemplate = userLayoutTemplate?.highContrast ?? defaultLayoutTemplate.highContrast;
            break;
        case vscode.ColorThemeKind.HighContrastLight:
            traceTemplate = userTraceTemplate?.highContrastLight ?? defaultTraceTemplate.highContrastLight;
            layoutTemplate = userLayoutTemplate?.highContrastLight ?? defaultLayoutTemplate.highContrastLight;
            break;
        default:
            traceTemplate = [];
            layoutTemplate = {};
    }

    return { data: { "scatter": traceTemplate }, "layout": layoutTemplate };
}
