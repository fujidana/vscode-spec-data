import * as vscode from 'vscode';
import { defaultTraceTemplate, defaultLayoutTemplate } from './previewTemplates';
import { parseDocument, parseTextFromUri, SPEC_DATA_FILTER, DPPMCA_FILTER, DOCUMENT_SELECTOR, CSV_ROWS_FILTER } from './dataParser';
import type { Node, ParserResult, ParserSuccess } from './dataParser';

// @types/plotly.js contains DOM objects and thus
// `tsc -p .` fails without `skipLibCheck`.
import type { PlotData, Layout, Template } from 'plotly.js';
// type PlotData = any;
// type Layout = any;
import type { State, GraphMode, MessageToWebview, MessageFromWebview } from './previewTypes';

type Preview = {
    readonly panel: vscode.WebviewPanel;
    uri: vscode.Uri;
    enableMultipleSelection: boolean;
    enableRightAxis: boolean;
    nodes?: Node[];
};

type ParserSession = {
    promise: Promise<ParserResult>,
    tokenSource: vscode.CancellationTokenSource | undefined,
};

/**
 * Provider class for "spec-data" language.
 */
export class DataProvider implements vscode.FoldingRangeProvider, vscode.DocumentSymbolProvider, vscode.WebviewPanelSerializer<State> {
    private readonly extensionUri;
    private readonly subscriptions;
    private readonly previews: Preview[] = [];
    private readonly parserSessionMap: Map<string, ParserSession> = new Map();
    private readonly diagnosticCollection = vscode.languages.createDiagnosticCollection('spec-data');

    private enablePreviewScroll: boolean;
    private livePreview: Preview | undefined = undefined;
    private colorThemeKind: vscode.ColorThemeKind;

    private lastScrollEditorTimeStamp = 0;
    private lastScrollPreviewTimeStamp = 0;

    private get activePreview(): Preview | undefined {
        return this.previews.find(preview => preview.panel.active);
    }

    constructor(context: vscode.ExtensionContext) {
        this.extensionUri = context.extensionUri;
        this.subscriptions = context.subscriptions;

        this.colorThemeKind = vscode.window.activeColorTheme.kind;

        const config = vscode.workspace.getConfiguration('spec-data.preview');
        this.enablePreviewScroll = config.get<boolean>('scrollPreviewWithEditor', true);

        // Create a command handler function that shows a preview.
        const makeShowPreviewCallback = (lockPreview: boolean, showToSide: boolean) => {
            return (...args: unknown[]) => {
                // Get the URIs of source files to be shown in the preview.
                // The URI of the source file can be provided via the command arguments or 
                // it can be inferred from the active editor.
                let uris: vscode.Uri[];
                if (args && args.length > 0) {
                    // Typically, the type of args is [vscode.Uri, vscode.Uri[]].
                    if (args.length >= 2 && Array.isArray(args[1]) && args[1].length > 0 && args[1].every(item => item instanceof vscode.Uri)) {
                        uris = args[1];
                        // If not locked, a single preview is reused for multiple URIs and thus the URIs except the last one are not needed.
                        if (!lockPreview) {
                            uris = [uris[uris.length - 1]];
                        }
                    } else if (args[0] instanceof vscode.Uri) {
                        uris = [args[0]];
                    } else {
                        vscode.window.showErrorMessage(vscode.l10n.t('Failed to parse URIs from the command arguments.'));
                        return;
                    }
                } else {
                    // If the URI is not provided via the arguments, get an URI from the active editor.
                    const editor = vscode.window.activeTextEditor;
                    if (editor) {
                        uris = [editor.document.uri];
                    } else {
                        vscode.window.showErrorMessage(vscode.l10n.t('Failed to find an active editor.'));
                        return;
                    }
                }

                // Show the preview(s).
                uris.forEach(uri => { this.showPreview(uri, lockPreview, showToSide); });
            };
        };

        // callback of 'spec-data.showSource'.
        const showSourceCallback = (..._args: unknown[]) => {
            const activePreview = this.activePreview;
            if (activePreview) {
                const document = vscode.workspace.textDocuments.find(
                    document => document.uri.toString() === activePreview.uri.toString()
                );
                if (document) {
                    vscode.window.showTextDocument(document);
                } else {
                    vscode.window.showTextDocument(activePreview.uri);
                }
            } else {
                vscode.window.showErrorMessage(vscode.l10n.t('Failed to find an active preview.'));
            }
        };

        // callback of 'spec-data.refreshPreview'.
        const refreshPreviewCallback = (..._args: unknown[]) => {
            const activePreview = this.activePreview;
            if (activePreview) {
                this.reloadPreview(activePreview, activePreview.uri, true);
            } else {
                vscode.window.showErrorMessage(vscode.l10n.t('Failed to find an active preview.'));
            }
        };

        // callback of 'spec-data.toggleMultipleSelection'.
        const toggleMultipleSelectionCallback = (..._args: unknown[]) => {
            const activePreview = this.activePreview;
            if (activePreview) {
                const flag = !activePreview.enableMultipleSelection;
                activePreview.enableMultipleSelection = flag;
                activePreview.panel.webview.postMessage({
                    type: 'enableMultipleSelection',
                    flag: flag
                } satisfies MessageToWebview);
            } else {
                vscode.window.showErrorMessage(vscode.l10n.t('Failed to find an active preview.'));
            }
        };

        // callback of 'spec-data.toggleRightAxis'.
        const toggleRightAxisCallback = (..._args: unknown[]) => {
            const activePreview = this.activePreview;
            if (activePreview) {
                const flag = !activePreview.enableRightAxis;
                activePreview.enableRightAxis = flag;
                activePreview.panel.webview.postMessage({
                    type: 'enableRightAxis',
                    flag: flag,
                } satisfies MessageToWebview);
            } else {
                vscode.window.showErrorMessage(vscode.l10n.t('Failed to find an active preview.'));
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
                    activePreview.panel.webview.postMessage({
                        type: 'lockPreview',
                        flag: true,
                    } satisfies MessageToWebview);
                    activePreview.panel.title = vscode.l10n.t('[Preview] {0}', filePath.substring(filePath.lastIndexOf('/') + 1));
                } else {
                    // If the active view is not a live preview...
                    if (this.livePreview) {
                        // Close the previous live view if it exists.
                        this.livePreview.panel.dispose();
                    }
                    // Set the active view to live view.
                    this.livePreview = activePreview;
                    activePreview.panel.webview.postMessage({
                        type: 'lockPreview',
                        flag: false,
                    } satisfies MessageToWebview);
                    activePreview.panel.title = vscode.l10n.t('Preview {0}', filePath.substring(filePath.lastIndexOf('/') + 1));
                }
            } else {
                vscode.window.showErrorMessage(vscode.l10n.t('Failed to find an active preview.'));
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
                this.diagnosticCollection.delete(document.uri);
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
                        preview.panel.webview.postMessage({
                            type: 'scrollPreview',
                            elementId: `l${node.lineStart}`,
                        } satisfies MessageToWebview);
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
                const flag = vscode.workspace.getConfiguration('spec-data.preview').get<boolean>('smoothScrolling', false);
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
                    preview.panel.webview.postMessage({
                        type: 'setTemplate',
                        template: getPlotlyTemplate(colorTheme.kind, preview.uri),
                        callback: 'relayout',
                    } satisfies MessageToWebview);
                }
            }
            this.colorThemeKind = colorTheme.kind;
        };

        // When the extension is activated by opening a file for this extension,
        // the `onDidOpenTextDocument` event is not fired.
        // Thus, run the parser session for each open document here.
        for (const document of vscode.workspace.textDocuments) {
            if (vscode.languages.match(DOCUMENT_SELECTOR, document)) {
                this.runParserSession(document);
            }
        }

        // Register providers and commands.
        context.subscriptions.push(
            vscode.commands.registerCommand('spec-data.showPreview', makeShowPreviewCallback(false, false)),
            vscode.commands.registerCommand('spec-data.showPreviewToSide', makeShowPreviewCallback(false, true)),
            vscode.commands.registerCommand('spec-data.showLockedPreview', makeShowPreviewCallback(true, false)),
            vscode.commands.registerCommand('spec-data.showLockedPreviewToSide', makeShowPreviewCallback(true, true)),
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
            vscode.workspace.onDidChangeConfiguration(configurationChangeListner),
            this.diagnosticCollection
        );
    }

    /**
     * Required implementation of vscode.FoldingRangeProvider.
     */
    public provideFoldingRanges(document: vscode.TextDocument, _context: vscode.FoldingContext, token: vscode.CancellationToken): vscode.ProviderResult<vscode.FoldingRange[]> {
        if (token.isCancellationRequested) { return; }

        return this.parserSessionMap.get(document.uri.toString())?.promise.then(
            result => result?.nodes !== undefined ? result.foldingRanges : undefined
        );
    }

    /**
     * Required implementation of vscode.DocumentSymbolProvider.
     */
    public provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
        if (token.isCancellationRequested) { return; }

        return this.parserSessionMap.get(document.uri.toString())?.promise.then(
            result => result?.nodes !== undefined ? result.documentSymbols : undefined
        );
    }

    /**
     * Required implementation of vscode.WebviewPanelSerializer.
     */
    public async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: State): Promise<void> {
        if (!state) {
            const message = vscode.l10n.t('Failed to restore the preview content because the previous state is not recorded. The tab will be closed.');
            vscode.window.showErrorMessage(message, 'OK').then(() => panel.dispose());
            return;
        }
        const uri = vscode.Uri.parse(state.sourceUri);
        const parsedData = await this.parseDataOfFileUri(uri);
        if (!parsedData || parsedData.nodes === undefined) {
            const message = vscode.l10n.t('Failed to parse file: "{0}"', vscode.workspace.asRelativePath(uri));
            vscode.window.showErrorMessage(message);
            return;
        }

        const preview: Preview = { panel, uri, enableMultipleSelection: state.enableMultipleSelection, enableRightAxis: state.enableRightAxis, };
        await this.postCreatePreview(preview, parsedData, state.lockPreview);
        return;
    }

    /**
     * Parse the document content.
     * Cancellation token is integrated.
     */
    private runParserSession(document: vscode.TextDocument): void {
        const uriString = document.uri.toString();

        // Create a new update session.
        const tokenSource = new vscode.CancellationTokenSource();
        const promise = new Promise<ParserResult>(resolve => resolve(
            parseDocument(document, tokenSource.token, this.diagnosticCollection)
        ));
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
     * @returns Preview object or `undefined` if failed to parse the file.
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
            if (!parsedData || parsedData.nodes === undefined) {
                const message = vscode.l10n.t('Failed to parse file: "{0}"', vscode.workspace.asRelativePath(uri));
                vscode.window.showErrorMessage(message);
                return;
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
    private async postCreatePreview(preview: Preview, parsedData: ParserSuccess, lockPreview: boolean) {
        this.previews.push(preview);
        preview.panel.iconPath = new vscode.ThemeIcon('graph-line');

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
            } else if (messageIn.type === 'requestData') {
                if (!preview.nodes) { return; };

                let index = 0;
                const node = preview.nodes.find(node => node.type === 'scanData' && index++ === messageIn.graphNumber);
                if (node && node.type === 'scanData' && node.data.length) {
                    if (messageIn.plotType === 'line') {
                        // Send back the selected data for line plot.
                        const { x: xIndex, y1: y1Indexes, y2: y2Indexes } = messageIn.selections;

                        const xData = (xIndex >= 0 && xIndex < node.data.length) ?
                            { label: node.headers[xIndex], array: node.data[xIndex] } :
                            undefined; // { label: 'point', array: Array(node.data[0].length).fill(0).map((_x, i) => i) };
                        const y1Data = y1Indexes.filter(y_i => y_i < node.data.length).map(y_i => { return { label: node.headers[y_i], array: node.data[y_i] }; });
                        const y2Data = y2Indexes.filter(y_i => y_i < node.data.length).map(y_i => { return { label: node.headers[y_i], array: node.data[y_i] }; });

                        preview.panel.webview.postMessage({
                            type: 'updatePlot',
                            plotType: 'line',
                            graphNumber: messageIn.graphNumber,
                            x: xData,
                            y1: y1Data,
                            y2: y2Data,
                            action: messageIn.callback,
                        } satisfies MessageToWebview);
                    } else if (messageIn.plotType === 'heatmap' && messageIn.dataType === 'serial') {
                        // Send back the selected data for heatmap, after reshaping the selected 1D data into a 2D array.

                        // if (node.subtype !== 'serial') { return; }
                        if (messageIn.selection < 0 || messageIn.selection >= node.data.length || !node.parameter || node.parameter.macro !== 'mesh') { return; }

                        const expectedLength = (node.parameter.interval0 + 1) * (node.parameter.interval1 + 1);
                        const selectedData = node.data[messageIn.selection];
                        let tmpData: (number | null)[];
                        if (selectedData.length === expectedLength) {
                            tmpData = selectedData;
                        } else if (selectedData.length < expectedLength) {
                            tmpData = selectedData.concat(new Array(expectedLength - selectedData.length).fill(null));
                        } else {
                            // console.log('The length of the selected data is longer than expected. The extra data will be ignored.');
                            tmpData = selectedData.slice(0, expectedLength);
                        }

                        // Reshape the selected 1D data into a 2D array for heatmap.
                        const zData: (number | null)[][] = [];
                        for (let i = 0; i < node.parameter.interval1 + 1; i++) {
                            zData.push(tmpData.slice(i * (node.parameter.interval0 + 1), (i + 1) * (node.parameter.interval0 + 1)));
                        }

                        // Send the data to webview.
                        preview.panel.webview.postMessage({
                            type: 'updatePlot',
                            plotType: 'heatmap',
                            dataType: 'matrix',
                            graphNumber: messageIn.graphNumber,
                            x: {
                                label: node.headers[0],
                                start: node.parameter.start0,
                                delta: (node.parameter.finish0 - node.parameter.start0) / node.parameter.interval0,
                            },
                            y: {
                                label: node.headers[1],
                                start: node.parameter.start1,
                                delta: (node.parameter.finish1 - node.parameter.start1) / node.parameter.interval1,
                            },
                            z: {
                                label: node.headers[messageIn.selection],
                                array: zData,
                            },
                            action: messageIn.callback,
                        } satisfies MessageToWebview);
                    } else if ((messageIn.plotType === 'heatmap' || messageIn.plotType === 'contour') && messageIn.dataType === 'matrix') {
                        // Send back the original 2D array for a heatmap or contour plot.
                        // No infomatioin about x- and y-scales are available in this format.

                        // if (node.subtype !== 'matrix' && node.subtype !== 'matrix-wo-label') { return; }

                        preview.panel.webview.postMessage({
                            type: 'updatePlot',
                            plotType: messageIn.plotType,
                            dataType: 'matrix',
                            graphNumber: messageIn.graphNumber,
                            z: {
                                // label: undefined,
                                array: node.data,
                            },
                            action: messageIn.callback,
                        } satisfies MessageToWebview);
                    } else if (messageIn.plotType === 'contour' && messageIn.dataType === 'serial') {
                        // Send back a set of 1D arrays of X, Y, and Z for contour plot.
                        const { x: xIndex, y: yIndex, z: zIndex } = messageIn.selections;
                        preview.panel.webview.postMessage({
                            type: 'updatePlot',
                            plotType: 'contour',
                            dataType: 'serial',
                            graphNumber: messageIn.graphNumber,
                            x: { label: node.headers[xIndex], array: node.data[xIndex] },
                            y: { label: node.headers[yIndex], array: node.data[yIndex] },
                            z: { label: node.headers[zIndex], array: node.data[zIndex] },
                            action: messageIn.callback,
                        } satisfies MessageToWebview);
                    }
                }
            } else if (messageIn.type === 'contentLoaded') {
                // This will be called not only when the webview is created but also when it is revealed after it is hidden.
                const config = vscode.workspace.getConfiguration('spec-data.preview');

                preview.panel.webview.postMessage({
                    type: 'lockPreview',
                    flag: this.livePreview?.panel !== preview.panel,
                } satisfies MessageToWebview);

                preview.panel.webview.postMessage({
                    type: 'enableEditorScroll',
                    flag: config.get<boolean>('scrollEditorWithPreview', true),
                } satisfies MessageToWebview);

                preview.panel.webview.postMessage({
                    type: 'setTemplate',
                    template: getPlotlyTemplate(vscode.window.activeColorTheme.kind, preview.uri),
                    callback: 'newPlot',
                } satisfies MessageToWebview);

                preview.panel.webview.postMessage({
                    type: 'setScrollBehavior',
                    value: config.get<boolean>('smoothScrolling', true) ? 'smooth' : 'auto'
                } satisfies MessageToWebview);

                preview.panel.webview.postMessage({
                    type: 'restoreScroll',
                    delay: true,
                } satisfies MessageToWebview);
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
        if (!forcesReload && preview.uri.toString() === uri.toString()) {
            return preview;
        }

        const parsedData = await this.parseDataOfFileUri(uri);
        if (!parsedData || parsedData.nodes === undefined) {
            const message = vscode.l10n.t('Failed to parse file: "{0}"', vscode.workspace.asRelativePath(uri));
            vscode.window.showErrorMessage(message);
            return undefined;
        }

        preview.uri = uri;
        this.updatePreviewWithNodes(preview, parsedData.language, parsedData.nodes);
        return preview;
    }

    private updatePreviewWithNodes(preview: Preview, language: string, nodes: Node[]) {
        const webview = preview.panel.webview;
        const filePath = preview.uri.path;
        const plotlyUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'preview', 'node_modules', 'plotly.js-cartesian-dist-min', 'plotly-cartesian.min.js'));
        const controllerUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'preview', 'previewController.js'));

        preview.nodes = nodes;
        preview.panel.title = this.livePreview === preview ?
            vscode.l10n.t('Preview {0}', filePath.substring(filePath.lastIndexOf('/') + 1)) :
            vscode.l10n.t('[Preview] {0}', filePath.substring(filePath.lastIndexOf('/') + 1));
        preview.panel.webview.html = getWebviewContent(preview, webview.cspSource, plotlyUri, controllerUri, language);
    }
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
        ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob: data:; style-src 'unsafe-inline'; script-src ${cspSource};">`
        : '';

    function getSanitizedString(text: string) {
        // const charactersReplacedWith = ['&amp;', '&lt;', '&gt;', '&quot;', '&#39;'];
        // return text.replace(/[&<>"']/g, (match) => charactersReplacedWith['&<>"\''.indexOf(match)]);
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function getAttributesForNode(node: Node) {
        return `id="l${node.lineStart}" class="${node.type}"`;
    }

    const header = `<!DOCTYPE html>
<html lang="en">
<head data-plot-height="${plotHeight}" data-source-uri="${preview.uri.toString()}" data-enable-multiple-selection="${Number(preview.enableMultipleSelection)}" data-enable-right-axis="${Number(preview.enableRightAxis)}">
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
    let scanDataCount = 0;

    for (const node of preview.nodes) {
        if (node.type === 'file') {
            lines.push(`<h1 ${getAttributesForNode(node)}>${getSanitizedString(node.value)}</h1>`);
        } else if (node.type === 'date') {
            lines.push(`<p ${getAttributesForNode(node)}>Date: ${getSanitizedString(node.value)}</p>`);
        } else if (node.type === 'comment') {
            lines.push(`<p ${getAttributesForNode(node)}>Comment: ${getSanitizedString(node.value)}</p>`);
        } else if (node.type === 'nameList') {
            if (node.subtype === 'mnemonic') {
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
<input type="checkbox" class="showValueListInput"${hideTable ? '' : ' checked'} />
Prescan Table
</label>
</p>
<table class="valueListTable"${hideTable ? ' hidden' : ''}>
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
            const hidePlot = scanDataCount++ >= maximumPlots;

            let modes: { label: string, value: GraphMode }[];
            if (node.subtype === 'serial') {
                modes = [{ label: 'line', value: 'line-xy' }];
                if (node.parameter?.macro === 'mesh') {
                    modes.push(
                        { label: 'heatmap', value: 'heatmap-serial' },
                        { label: 'contour', value: 'contour-serial' },
                    );
                } else if (node.parameter?.macro === 'fscan' && node.headers.findIndex(header => header === 'Epoch') > 1) {
                    // Enable 'contour' mode for 'fscan' with multiple motors.
                    // The number of motors can be inferred from the number of column names before 'Epoch'.
                    modes.push({ label: 'contour', value: 'contour-serial' });
                }
            } else { // 'matrix' | 'matrix-wo-label'
                modes = [{ label: 'line', value: node.subtype === 'matrix-wo-label' ? 'line-y' : 'line-xy' }];
                if (node.data.length > 1 && node.data[0].length > 1) {
                    modes.push(
                        { label: 'heatmap', value: 'heatmap-matrix' },
                        { label: 'contour-2D', value: 'contour-matrix' },
                    );
                }
                if (node.data.length > 2 && node.data[0].length > 1) {
                    modes.push({ label: 'contour-XYZ', value: 'contour-serial' });
                }
            }

            lines.push(`<div ${getAttributesForNode(node)}>`);
            if (data.length) {
                lines.push(`<p>
<label>
<input type="checkbox" class="showPlotInput"${hidePlot ? '' : ' checked'} />
Plot
</label>
<span class="modeSpan"${modes.length <= 1 ? ' hidden' : ''}>
;
<label class="modeLabel">
mode: 
<select class="modeSelect">`);

                lines.push(...modes.map(mode => `<option value="${mode.value}">${mode.label}</option>`));
                lines.push(`</select>
</label>
</span>
<span class="axesSpan">`);

                for (let i = 0; i < 3; i++) {
                    lines.push(`<span class="x${i} axisSpan">
;
<label class="x${i} dataLabel">
<span class="x${i} dataAxisNameSpan"><var>x</var><sub>${i}</sub></span>:
<select class="x${i} dataSelect">`);

                    [...headers, '[extra]'].forEach((header, j) => {
                        lines.push(`<option value="${j}">${getSanitizedString(header)}</option>`);
                    });

                    lines.push(`</select>
</label>
<span class="x${i} logSpan"${i === 0 ? ' hidden' : ''}>
,
<label class="x${i} logLabel">
<input type="checkbox" class="x${i} logInput" />log
</label>
</span>
</span>`);
                }
                lines.push(`</span></p>`);
                lines.push(`<div class="graphDiv"></div>`);
            }
            lines.push(`</div>`);
        } else if (node.type === 'unknown') {
            // lines.push(`<p>#${node.kind} ${node.value}</p>`);
        }
    }

    return header + lines.join('\n') + `</body>
    </html>`;
}

type ColorThemeKind = 'light' | 'dark' | 'highContrast' | 'highContrastLight';

function getPlotlyTemplate(kind: vscode.ColorThemeKind, scope?: vscode.ConfigurationScope): Template {
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

    return { data: { scatter: traceTemplate }, layout: layoutTemplate };
}
