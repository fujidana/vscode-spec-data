import * as vscode from 'vscode';
import { defaultTraceTemplate, defaultLayoutTemplate } from './previewTemplates';
import { parseDocument, parseFromUri, SPEC_DATA_FILTER, DPPMCA_FILTER, DOCUMENT_SELECTOR } from './dataParser';
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
    config: PreviewConfig;
    tree?: Node[];
};

type PreviewConfig = {
    enableMultipleSelection: boolean;
    enableRightAxis: boolean;
};

interface Session { type: 'session', panel: vscode.WebviewPanel, state: State };
interface WebviewInitParam { type: 'param', uri: vscode.Uri, lockPreview: boolean, showToSide: boolean }

/**
 * Provider class for "spec-data" language
 */
export class DataProvider implements vscode.FoldingRangeProvider, vscode.DocumentSymbolProvider, vscode.WebviewPanelSerializer<State> {
    readonly extensionUri;
    readonly subscriptions;
    readonly previews: Preview[] = [];
    readonly parsedDataMap = new Map<string, ParsedData | undefined>();

    enablePreviewScroll: boolean;
    livePreview: Preview | undefined = undefined;
    colorThemeKind: vscode.ColorThemeKind;

    lastScrollEditorTimeStamp = 0;
    lastScrollPreviewTimeStamp = 0;

    constructor(context: vscode.ExtensionContext) {
        this.extensionUri = context.extensionUri;
        this.subscriptions = context.subscriptions;
        this.colorThemeKind = vscode.window.activeColorTheme.kind;

        const config = vscode.workspace.getConfiguration('spec-data.preview');
        this.enablePreviewScroll = config.get<boolean>('scrollPreviewWithEditor', true);

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

        // callback of 'spec-data.showLockedPreview'.
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
                this.reloadPreview(activePreview, activePreview.uri, true);
            } else {
                vscode.window.showErrorMessage('Failed in finding active preview tab.');
            }
        };

        // callback of 'spec-data.toggleMultipleSelection'.
        const toggleMultipleSelectionCallback = (..._args: unknown[]) => {
            const activePreview = this.getActivePreview();
            if (activePreview) {
                const flag = !activePreview.config.enableMultipleSelection;
                activePreview.config.enableMultipleSelection = flag;
                const messageOut: MessageToWebview = { type: 'enableMultipleSelection', flag: flag };
                activePreview.panel.webview.postMessage(messageOut);
            } else {
                vscode.window.showErrorMessage('Failed in finding active preview tab.');
            }
        };

        // callback of 'spec-data.toggleRightAxis'.
        const toggleRightAxisCallback = (..._args: unknown[]) => {
            const activePreview = this.getActivePreview();
            if (activePreview) {
                const flag = !activePreview.config.enableRightAxis;
                activePreview.config.enableRightAxis = flag;
                const messageOut: MessageToWebview = { type: 'enableRightAxis', flag: flag };
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

        // a hander invoked when the document is opened
        // this is also invoked after the user manually changed the language id
        const textDocumentDidOpenListener = (document: vscode.TextDocument) => {
            if (vscode.languages.match(DOCUMENT_SELECTOR, document)) {
                this.parsedDataMap.set(document.uri.toString(), parseDocument(document));
            }
        };

        // a hander invoked when the document is changed
        const textDocumentDidChangeListener = (event: vscode.TextDocumentChangeEvent) => {
            const document = event.document;
            if (vscode.languages.match(DOCUMENT_SELECTOR, document)) {
                this.parsedDataMap.set(document.uri.toString(), parseDocument(document));
            }
        };

        // a hander invoked when the document is closed
        // this is also invoked after the user manually changed the language id
        const textDocumentDidCloseListener = (document: vscode.TextDocument) => {
            if (vscode.languages.match(DOCUMENT_SELECTOR, document)) {
                this.parsedDataMap.delete(document.uri.toString());
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
                this.parsedDataMap.set(document.uri.toString(), parseDocument(document));
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

        return this.parsedDataMap.get(document.uri.toString())?.foldingRanges;
    }

    /**
     * Required implementation of vscode.DocumentSymbolProvider
     */
    public provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
        if (token.isCancellationRequested) { return; }

        return this.parsedDataMap.get(document.uri.toString())?.documentSymbols;
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
        this.initPreview({ type: 'session', panel, state });
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
            // Else create a new panel as a live panel.
            return await this.initPreview({ type: 'param', uri, lockPreview, showToSide });
        }
    }

    /**
     * Register event handlers and then make a content from source.
     * Create a webview panel if `panel` parameter is undefined. 
     * 
     * The panel is reused after `uri` is changed. Thus, the configuration
     * applied to the panel is window-wide, not file- or workspace-specific.
     * @param sessionOrParam `Session` for deserialization with a reused panel and `WebviewInitParam` for newly created panel.
     * @returns Preview object if succeeded in parsing a file or `undefined`.
     */
    private async initPreview(sessionOrParam: Session | WebviewInitParam) {
        const uri: vscode.Uri = (sessionOrParam.type === 'session') ? vscode.Uri.parse(sessionOrParam.state.sourceUri) : sessionOrParam.uri;

        const tree = this.parsedDataMap.has(uri.toString()) ? this.parsedDataMap.get(uri.toString())?.nodes : await parseFromUri(uri);
        if (!tree) {
            const message = `Failed in parsing the file: ${vscode.workspace.asRelativePath(uri)}.`;
            vscode.window.showErrorMessage(message);
            return undefined;
        }

        // If panel is not provided, create a new panel.
        let panel: vscode.WebviewPanel;
        let enableMultipleSelection: boolean;
        let enableRightAxis: boolean;
        let lockPreview: boolean;
        if (sessionOrParam.type === 'session') {
            // Preexistent panel is reused. This is the case web view is restored from the previous session.
            panel = sessionOrParam.panel;
            enableMultipleSelection = sessionOrParam.state.enableMultipleSelection;
            enableRightAxis = sessionOrParam.state.enableRightAxis;
            lockPreview = sessionOrParam.state.lockPreview;
        } else {
            const config = vscode.workspace.getConfiguration('spec-data.preview');
            panel = vscode.window.createWebviewPanel(
                'spec-data.preview',
                'Preview spec data',
                sessionOrParam.showToSide ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active,
                {
                    // localResourceRoots: [this.extensionUri],
                    enableScripts: true,
                    retainContextWhenHidden: config.get<boolean>('retainContextWhenHidden', false),
                }
            );
            enableMultipleSelection = config.get<boolean>('plot.enableMultipleSelection', false);
            enableRightAxis = config.get<boolean>('plot.enableRightAxis', false);
            lockPreview = sessionOrParam.lockPreview;

            if (sessionOrParam.showToSide && config.get<boolean>('autoLockGroup', true)) {
                vscode.commands.executeCommand('workbench.action.lockEditorGroup');
            }
        }

        const preview: Preview = {
            uri, panel, config: { enableMultipleSelection, enableRightAxis },
        };
        this.previews.push(preview);
        if (!lockPreview) {
            this.livePreview = preview;
        }

        panel.onDidDispose(() => {
            // remove the closed preview from the array.
            const index = this.previews.findIndex(preview => preview.panel === panel);
            if (index >= 0) {
                this.previews.splice(index, 1);
            }

            // clear the live preview reference if the closed preview is the live preview.
            if (this.livePreview?.panel === panel) {
                this.livePreview = undefined;
            }
        }, null, this.subscriptions);

        panel.webview.onDidReceiveMessage((messageIn: MessageFromWebview) => {
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
                if (preview.tree) {
                    let index = 0;
                    const node = preview.tree.find(node => node.type === 'scanData' && index++ === messageIn.graphNumber);
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
                        panel.webview.postMessage(messageOut);
                    }
                }
            } else if (messageIn.type === 'contentLoaded') {
                // This will be called not only when the webview is created but also when it is revealed after it is hidden.
                const config = vscode.workspace.getConfiguration('spec-data.preview');
                let messageOut: MessageToWebview;

                messageOut = { type: 'lockPreview', flag: this.livePreview?.panel !== panel };
                preview.panel.webview.postMessage(messageOut);

                messageOut = { type: 'enableEditorScroll', flag: config.get<boolean>('scrollEditorWithPreview', true) };
                preview.panel.webview.postMessage(messageOut);

                messageOut = {
                    type: 'setTemplate',
                    template: getPlotlyTemplate(vscode.window.activeColorTheme.kind, uri),
                    callback: 'newPlot'
                };
                panel.webview.postMessage(messageOut);

                messageOut = { type: 'setScrollBehavior', value: config.get<boolean>('smoothScrolling', true) ? 'smooth' : 'auto' };
                preview.panel.webview.postMessage(messageOut);

                messageOut = { type: 'restoreScroll', delay: true };
                preview.panel.webview.postMessage(messageOut);
            }
        }, null, this.subscriptions);

        this.updatePreviewWithTree(preview, tree);

        return preview;
    }

    /**
     * Reuse the panel in `preview` and update a content from source if the URI is changed.
     * @param preview Preview object
     * @param source URI or document.
     * @param forcesReload Flag whether the preview should be reloaded regardless of the source URI.
     * @returns boolean value indicating whether the preview was reloaded or not.
     */
    private async reloadPreview(preview: Preview, uri: vscode.Uri, forcesReload = false) {
        // If the source URI is the same as the preview URI, do not reload.
        if (forcesReload === false && preview.uri.toString() === uri.toString()) {
            return preview;
        }

        const tree = this.parsedDataMap.has(uri.toString()) ? this.parsedDataMap.get(uri.toString())?.nodes : await parseFromUri(uri);
        if (!tree) {
            const message = `Failed in parsing the file: ${vscode.workspace.asRelativePath(uri)}.`;
            vscode.window.showErrorMessage(message);
            return undefined;
        }

        preview.uri = uri;
        this.updatePreviewWithTree(preview, tree);

        return preview;
    }

    private updatePreviewWithTree(preview: Preview, tree: Node[]) {
        const webview = preview.panel.webview;
        const label = this.livePreview === preview ? 'Preview' : '[Preview]';
        const plotlyJsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'preview', 'node_modules', 'plotly.js-basic-dist-min', 'plotly-basic.min.js'));
        const controllerJsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'preview', 'previewController.js'));

        preview.tree = tree;
        preview.panel.title = `${label} ${preview.uri.path.substring(preview.uri.path.lastIndexOf('/') + 1)}`;
        preview.panel.webview.html = getWebviewContent(webview.cspSource, preview.uri, plotlyJsUri, controllerJsUri, tree, preview.config.enableMultipleSelection, preview.config.enableRightAxis);
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


function getWebviewContent(cspSource: string, sourceUri: vscode.Uri, plotlyJsUri: vscode.Uri, controllerJsJri: vscode.Uri, nodes: Node[], enableMultipleSelection: boolean, enableRightAxis: boolean): string {
    const nameLists: { [name: string]: string[] } = {};
    const mnemonicLists: { [name: string]: string[] } = {};

    const config = vscode.workspace.getConfiguration('spec-data.preview', sourceUri);
    const hideTable = config.get<boolean>('table.hide', true);
    const columnsPerLine = config.get<number>('table.columnsPerLine', 8);
    const headerType = config.get<string>('table.headerType', 'mnemonic');
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
<head data-maximum-plots="${maximumPlots}" data-plot-height="${plotHeight}" data-hide-table="${Number(hideTable)}" data-source-uri="${sourceUri.toString()}" data-enable-multiple-selection="${Number(enableMultipleSelection)}" data-enable-right-axis="${Number(enableRightAxis)}">
	<meta charset="UTF-8">
    ${metaCspStr}
    <title>Preview of spec-data</title>
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="${plotlyJsUri}"></script>
    <script src="${controllerJsJri}"></script>
</head>
<body>
`;

    const lines: string[] = [];
    for (const node of nodes) {
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
                lines.push(getAxisSelectAndOptions('y2', [...headers, '[none]'], size, true, !enableRightAxis));
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
