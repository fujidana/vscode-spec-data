import * as vscode from 'vscode';
import type { Template } from 'plotly.js';

import { defaultDataTemplate, defaultLayoutTemplate, type ColorThemeKindLabel } from './template';
import { parseDocument, SPEC_DATA_FILTER, DPPMCA_FILTER, DOCUMENT_SELECTOR } from './parser';
import type { Node, ParserResult, SupportedLanguage } from './parser';
import type { State, GraphMode, MessageToWebview, MessageFromWebview } from '../types';

interface Preview {
    readonly panel: vscode.WebviewPanel;
    mode: 'locked' | 'live' | 'editor';
    uri: vscode.Uri;
    language: SupportedLanguage;
    nodes: Node[];
    enableMultipleSelection: boolean;
    enableRightAxis: boolean;
}

interface ParserSession {
    promise: Promise<ParserResult>;
    tokenSource: vscode.CancellationTokenSource | undefined;
}

/** Main controller class. */
export class Provider implements vscode.FoldingRangeProvider, vscode.DocumentSymbolProvider, vscode.CustomTextEditorProvider, vscode.WebviewPanelSerializer<State> {
    private readonly extensionUri;
    private readonly subscriptions;
    private readonly previews: Preview[] = [];
    private readonly parserSessionMap: Map<string, ParserSession> = new Map();
    private readonly diagnosticCollection = vscode.languages.createDiagnosticCollection('spec-data');

    private enablePreviewScroll: boolean;
    private colorThemeKind: vscode.ColorThemeKind;

    private lastScrollEditorTimeStamp = 0;
    private lastScrollPreviewTimeStamp = 0;

    /** Returns the active (i.e., currently focused) preview, if it exists. */
    private get activePreview(): Preview | undefined {
        return this.previews.find(preview => preview.panel.active);
    }

    /** Returns the live preview, if it exists. In some situations, there may be multiple live previews. In such cases, the first one is returned. */
    private get livePreview(): Preview | undefined {
        return this.previews.find(preview => preview.mode === 'live');
    }

    constructor(context: vscode.ExtensionContext) {
        this.extensionUri = context.extensionUri;
        this.subscriptions = context.subscriptions;
        this.colorThemeKind = vscode.window.activeColorTheme.kind;
        this.enablePreviewScroll = vscode.workspace.getConfiguration('spec-data.preview').get<boolean>('scrollPreviewWithEditor', true);

        /** Creates a callback function for showing previews. */
        const makeShowPreviewCallback = (mode: 'live' | 'locked', showToSide: boolean) => {
            return (...args: unknown[]) => {
                // Get the URIs of source files to be shown in the preview.
                // The URI of the source file can be provided via the command arguments or 
                // it can be inferred from the active editor.
                let uris: vscode.Uri[];
                if (args && args.length > 0) {
                    // Typically, the type of args is [vscode.Uri, vscode.Uri[]].
                    if (args.length >= 2 && Array.isArray(args[1]) && args[1].length > 0 && args[1].every(item => item instanceof vscode.Uri)) {
                        uris = args[1];
                        // A single "live" preview is reused for multiple URIs and thus the URIs except the last one are not needed.
                        if (mode === 'live') {
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
                uris.forEach(uri => { this.showPreview(uri, mode, showToSide); });
            };
        };

        /** Callback function for showing source files from previews ('spec-data.preview.showSource'). */
        const showSourceCallback = (..._args: unknown[]) => {
            const preview = this.activePreview;
            if (preview) {
                const document = vscode.workspace.textDocuments.find(
                    document => document.uri.toString() === preview.uri.toString()
                );
                if (document) {
                    vscode.window.showTextDocument(document);
                } else {
                    vscode.window.showTextDocument(preview.uri);
                }
            } else {
                vscode.window.showErrorMessage(vscode.l10n.t('Failed to find an active preview.'));
            }
        };

        /** Callback function for reopening files with the custom editor ('spec-data.preview.reopenAsPreview'). */
        const reopenAsPreviewCallback = (..._args: unknown[]) => {
            vscode.commands.executeCommand('reopenActiveEditorWith', 'spec-data.preview.editor');
        };

        /** Callback function for reopening files with the built-in editor ('spec-data.preview.reopenAsSource'). */
        const reopenAsSourceCallback = (..._args: unknown[]) => {
            vscode.commands.executeCommand('workbench.action.reopenTextEditor');
        };

        /** Callback function for refreshing previews ('spec-data.preview.refresh'). */
        const refreshPreviewCallback = (...args: unknown[]) => {
            const preview = this.findSelectedPreview(args);
            if (preview) {
                this.reloadPreview(preview, preview.uri, true);
            } else {
                vscode.window.showErrorMessage(vscode.l10n.t('Failed to find an active preview.'));
            }
        };

        /** Callback function for toggling multiple selection ('spec-data.preview.toggleMultipleSelection'). */
        const toggleMultipleSelectionCallback = (...args: unknown[]) => {
            const preview = this.findSelectedPreview(args);
            if (preview) {
                const flag = !preview.enableMultipleSelection;
                preview.enableMultipleSelection = flag;
                preview.panel.webview.postMessage({
                    type: 'enableMultipleSelection',
                    flag: flag
                } satisfies MessageToWebview);
            } else {
                vscode.window.showErrorMessage(vscode.l10n.t('Failed to find an active preview.'));
            }
        };

        /** Callback function for toggling the right axis ('spec-data.preview.toggleRightAxis'). */
        const toggleRightAxisCallback = (...args: unknown[]) => {
            const preview = this.findSelectedPreview(args);
            if (preview) {
                const flag = !preview.enableRightAxis;
                preview.enableRightAxis = flag;
                preview.panel.webview.postMessage({
                    type: 'enableRightAxis',
                    flag: flag,
                } satisfies MessageToWebview);
            } else {
                vscode.window.showErrorMessage(vscode.l10n.t('Failed to find an active preview.'));
            }
        };

        /** Callback function for toggling the lock state of previews ('spec-data.preview.toggleLock'). */
        const togglePreviewLockCallback = (..._args: unknown[]) => {
            const preview = this.activePreview;
            if (!preview) {
                vscode.window.showErrorMessage(vscode.l10n.t('Failed to find an active preview.'));
                return;
            }

            if (preview.mode === 'editor') {
                vscode.window.showErrorMessage(vscode.l10n.t('The custom editor cannot be locked or unlocked.'));
                return;
            }

            const filePath = preview.uri.path;
            if (preview.mode === 'live') {
                // If the active view is a live preview, lock the view to the file.
                preview.mode = 'locked';
                preview.panel.webview.postMessage({
                    type: 'setMode',
                    mode: 'locked',
                } satisfies MessageToWebview);
                preview.panel.title = vscode.l10n.t('[Preview] {0}', filePath.substring(filePath.lastIndexOf('/') + 1));
            } else {
                // If the active view is not a live preview,
                // 1) close the previous live view if it exists, and then 2) set the active view to live view.
                this.livePreview?.panel.dispose();

                preview.mode = 'live';
                preview.panel.webview.postMessage({
                    type: 'setMode',
                    mode: 'live',
                } satisfies MessageToWebview);
                preview.panel.title = vscode.l10n.t('Preview {0}', filePath.substring(filePath.lastIndexOf('/') + 1));
            }
        };

        /** Event listener for when a text document is opened. Also fired when the language ID is manually changed. */
        const textDocumentDidOpenListener = (document: vscode.TextDocument) => {
            // console.log('Document opened: ', vscode.workspace.asRelativePath(document.uri));
            if (vscode.languages.match(DOCUMENT_SELECTOR, document)) {
                this.runParserSession(document);
            }
        };

        /** Event listener for when a text document is changed.  */
        const textDocumentDidChangeListener = (event: vscode.TextDocumentChangeEvent) => {
            // console.log('Document changed: ', vscode.workspace.asRelativePath(event.document.uri));
            const document = event.document;
            if (vscode.languages.match(DOCUMENT_SELECTOR, document)) {
                this.runParserSession(document);
            }
        };

        /** Event listener for when a text document is closed. Also fired when the language ID is manually changed. */
        const textDocumentDidCloseListener = (document: vscode.TextDocument) => {
            // console.log('Document closed: ', vscode.workspace.asRelativePath(document.uri));
            if (vscode.languages.match(DOCUMENT_SELECTOR, document)) {
                this.parserSessionMap.delete(document.uri.toString());
                this.diagnosticCollection.delete(document.uri);
            }
        };

        /** Event listener for when the active text editor changes. */
        const activeTextEditorChangeListener = (editor: vscode.TextEditor | undefined) => {
            // console.log('Active text editor changed: ', editor?.document.uri ? vscode.workspace.asRelativePath(editor.document.uri) : undefined);
            if (editor) {
                const document = editor.document;
                if (vscode.languages.match(DOCUMENT_SELECTOR, document) && this.livePreview) {
                    this.reloadPreview(this.livePreview, document.uri, false);
                }
            }
        };

        /** Event listener for when the visible ranges of a text editor change. */
        const textEditorVisibleRangesChangeListener = (event: vscode.TextEditorVisibleRangesChangeEvent) => {
            const now = Date.now();
            const document = event.textEditor.document;
            if (this.enablePreviewScroll && vscode.languages.match(DOCUMENT_SELECTOR, document) && now - this.lastScrollEditorTimeStamp > 1500 && event.visibleRanges.length > 0) {
                // Refrain from sending 'scrollPreview' message soon ( < 1.5 sec) after receiving 'scrollEditor' message.

                const line = event.visibleRanges[0].start.line;
                const previews = this.previews.filter(preview => preview.uri.toString() === document.uri.toString());
                for (const preview of previews) {
                    // Find the first node that includes the top visible line in the editor.
                    // Note that not all nodes are expressed as HTML elements in the webview.
                    const node = preview.nodes?.find(node => {
                        return (
                            node.lineEnd >= line &&
                            (node.type === 'file' || node.type === 'date' || node.type === 'comment' || node.type === 'scanHead' || node.type === 'valueList' || node.type === 'scanData')
                        );
                    });
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

        /** Event listener for when the configuration changes. */
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
            for (const preview of this.previews) {
                const scope = { languageId: preview.language, uri: preview.uri };
                if (
                    // event.affectsConfiguration('spec-data.preview.plot.height', scope)) ||
                    event.affectsConfiguration('spec-data.preview.plot.colorScale', scope) ||
                    event.affectsConfiguration('spec-data.preview.plot.template', scope)
                ) {
                    preview.panel.webview.postMessage({
                        type: 'setTemplate',
                        template: getPlotlyTemplate(this.colorThemeKind, scope),
                        callback: 'relayout',
                    } satisfies MessageToWebview);
                }
            }
        };

        /** Event listener for when the active color theme changes. */
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
                        template: getPlotlyTemplate(colorTheme.kind, { uri: preview.uri, languageId: preview.language }),
                        callback: 'relayout',
                    } satisfies MessageToWebview);
                }
            }
            this.colorThemeKind = colorTheme.kind;
        };

        // When the extension is activated by opening a file this extension supports,
        // the `onDidOpenTextDocument` event is not fired.
        // Thus, run the parser session for each open document here.
        for (const document of vscode.workspace.textDocuments) {
            if (vscode.languages.match(DOCUMENT_SELECTOR, document)) {
                this.runParserSession(document);
            }
        }

        // Register providers and commands.
        const customEditorOption: { webviewOptions: vscode.WebviewPanelOptions } = {
            webviewOptions: {
                retainContextWhenHidden: vscode.workspace.getConfiguration('spec-data.preview').get<boolean>('retainContextWhenHidden', false),
            },
        };

        context.subscriptions.push(
            // Register command handlers for showing preview and other actions.
            vscode.commands.registerCommand('spec-data.showPreview', makeShowPreviewCallback('live', false)),
            vscode.commands.registerCommand('spec-data.showPreviewToSide', makeShowPreviewCallback('live', true)),
            vscode.commands.registerCommand('spec-data.showLockedPreview', makeShowPreviewCallback('locked', false)),
            vscode.commands.registerCommand('spec-data.showLockedPreviewToSide', makeShowPreviewCallback('locked', true)),
            vscode.commands.registerCommand('spec-data.preview.toggleLock', togglePreviewLockCallback),
            vscode.commands.registerCommand('spec-data.preview.showSource', showSourceCallback),
            vscode.commands.registerCommand('spec-data.reopenAsPreview', reopenAsPreviewCallback),
            vscode.commands.registerCommand('spec-data.reopenAsSource', reopenAsSourceCallback),
            vscode.commands.registerCommand('spec-data.preview.refresh', refreshPreviewCallback),
            vscode.commands.registerCommand('spec-data.preview.toggleMultipleSelection', toggleMultipleSelectionCallback),
            vscode.commands.registerCommand('spec-data.preview.toggleRightAxis', toggleRightAxisCallback),
            // Register providers.
            vscode.languages.registerFoldingRangeProvider([SPEC_DATA_FILTER, DPPMCA_FILTER], this),
            vscode.languages.registerDocumentSymbolProvider([SPEC_DATA_FILTER, DPPMCA_FILTER], this),
            vscode.window.registerCustomEditorProvider('spec-data.preview.editor', this, customEditorOption),
            vscode.window.registerWebviewPanelSerializer('spec-data.preview', this),
            // Register event listeners.
            vscode.workspace.onDidOpenTextDocument(textDocumentDidOpenListener),
            vscode.workspace.onDidChangeTextDocument(textDocumentDidChangeListener),
            vscode.workspace.onDidCloseTextDocument(textDocumentDidCloseListener),
            vscode.window.onDidChangeActiveTextEditor(activeTextEditorChangeListener),
            vscode.window.onDidChangeTextEditorVisibleRanges(textEditorVisibleRangesChangeListener),
            vscode.window.onDidChangeActiveColorTheme(activeColorThemeChangeListener),
            vscode.workspace.onDidChangeConfiguration(configurationChangeListner),
            // Other disposables.
            this.diagnosticCollection
        );
    }

    // Required implementation of vscode.FoldingRangeProvider.
    public provideFoldingRanges(document: vscode.TextDocument, _context: vscode.FoldingContext, token: vscode.CancellationToken): vscode.ProviderResult<vscode.FoldingRange[]> {
        if (token.isCancellationRequested) { return; }

        return this.parserSessionMap.get(document.uri.toString())?.promise.then(
            result => result?.nodes !== undefined ? result.foldingRanges : undefined
        );
    }

    // Required implementation of vscode.DocumentSymbolProvider.
    public provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
        if (token.isCancellationRequested) { return; }

        return this.parserSessionMap.get(document.uri.toString())?.promise.then(
            result => result?.nodes !== undefined ? result.documentSymbols : undefined
        );
    }

    // Required implementation of vscode.CustomTextEditorProvider.
    public async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel, token: vscode.CancellationToken): Promise<void> {
        // console.log('Resolving custom editor for document: ', vscode.workspace.asRelativePath(document.uri));

        // It appears this method is called after the didOpenTextDocument event is fired.
        // Then, the parser session for the documentURI is already created and thus
        // `workspace.openTextDocument(uri)` is not needed here.
        const parserResult = await this.parserSessionMap.get(document.uri.toString())?.promise;
        if (token.isCancellationRequested) { return; }

        // If the file cannot be parsed successfully, show an error message in the webview.
        if (parserResult?.nodes === undefined) {
            const reopenWithCommand = `<a href="command:workbench.action.reopenWithEditor">Reopen Editor With...</a>`;

            panel.webview.options = { enableCommandUris: true };
            panel.webview.html = `<html>
<body>
<h2>${vscode.l10n.t('Failed to parse the file')}</h2>
<p>${vscode.l10n.t('To open the source file, call the "{0}" command and select the "Text Editor (Built-in)".', reopenWithCommand)}</p>
</body>
</html>`;
            return;
        }

        // Show the preview if the file is parsed successfully.
        panel.webview.options = { enableScripts: true };
        const config = vscode.workspace.getConfiguration('spec-data.preview');
        const { language, nodes } = parserResult;
        const enableMultipleSelection = config.get<boolean>('plot.enableMultipleSelection', false);
        const enableRightAxis = config.get<boolean>('plot.enableRightAxis', false);
        const preview: Preview = {
            panel, mode: 'editor', uri: document.uri, language, nodes, enableMultipleSelection, enableRightAxis
        };
        this.postCreatePreview(preview);
        return;
    }

    // Required implementation of vscode.WebviewPanelSerializer.
    public async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: State): Promise<void> {
        if (!state || state.mode === undefined) {
            const message = vscode.l10n.t('Failed to restore the preview content because the previous state is not recorded. This tab will be closed.');
            return vscode.window.showErrorMessage(message, 'OK').then(() => panel.dispose());
        }

        // When a preview tab carried over form the previous session is hidden
        // behind another tab, deserialization is deferred until the tab is focused.
        // During that time, another live preview can be created. In such cases,
        // the deserialized preview will be closed to avoid having multiple live previews.
        if (state.mode === 'live' && this.livePreview) {
            const message = vscode.l10n.t('Another preview tab already exists. This tab will be closed.');
            return vscode.window.showWarningMessage(message, 'OK').then(() => panel.dispose());
        }

        const uri = vscode.Uri.parse(state.sourceUri);
        const parserResult = await this.parseDataOfFileUri(uri);
        if (parserResult?.nodes === undefined) {
            const message = vscode.l10n.t('Failed to parse file: "{0}". This tab will be closed.', vscode.workspace.asRelativePath(uri));
            return vscode.window.showErrorMessage(message, 'OK').then(() => panel.dispose());
        }

        const { language, nodes } = parserResult;
        const { mode, enableMultipleSelection, enableRightAxis } = state;
        const preview: Preview = {
            panel, mode, uri, language, nodes, enableMultipleSelection, enableRightAxis
        };
        this.postCreatePreview(preview);
        return;
    }

    /**
     * Find the selected preview based on the arguments passed to command handlers.
     * The method returns a wrong preview when:
     * - the command is called from a preview panel (not a custom editor) and
     * - multiple view columns are used and
     * - select an UI component (button or menu item) of a inactive panel.
     * @param args Arguments passed to a command handler.
     * @returns Preview object or `undefined` if the preview cannot be guessed.
     */
    private findSelectedPreview(args: unknown[]): Preview | undefined {
        // The arguments passed to command handlers can be a type of [Uri, { groupID: number }].
        // When the command is called from the custom editor, the URI points to the source URI
        // and thus the correct preview is found.
        // Otherwise, the URI does not point to the source file and thus preview is not found.
        if (args && args.length > 0 && args[0] instanceof vscode.Uri) {
            const uri = args[0];
            const preview = this.previews.find(preview => preview.uri.toString() === uri.toString());
            if (preview) {
                return preview;
            }
        }
        // Fallback to the active preview.
        return this.activePreview;
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
            parseDocument(document, this.diagnosticCollection, tokenSource.token)
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
     * Show a preview. If the new preview is for live and another live preview preexists,
     * the preexisting panel is reused. Else a new panel is created.
     * @param uri Source file URI.
     * @param mode Preview mode, either `"live"` or `"locked"`.
     * @param showToSide Flag whether the new preview panel is shown to side (`true`) or in the active editor (`false`).
     * @returns Preview object or `undefined` if failed to parse the file.
     */
    private async showPreview(uri: vscode.Uri, mode: 'live' | 'locked', showToSide: boolean) {
        const livePreview = this.livePreview;
        if (mode === 'live' && livePreview) {
            // Update the content of the existing panel.
            // If the URI is not changed,, the content won't be updated.
            await this.reloadPreview(livePreview, uri, false);
            livePreview.panel.reveal();
            return livePreview;
        } else {
            // Else create a new webview panel.
            const parserResult = await this.parseDataOfFileUri(uri);
            if (parserResult?.nodes === undefined) {
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
            const { language, nodes } = parserResult;
            const enableMultipleSelection = config.get<boolean>('plot.enableMultipleSelection', false);
            const enableRightAxis = config.get<boolean>('plot.enableRightAxis', false);
            const preview: Preview = {
                panel, mode, uri, language, nodes, enableMultipleSelection, enableRightAxis
            };
            if (showToSide && config.get<boolean>('autoLockGroup', false)) {
                vscode.commands.executeCommand('workbench.action.lockEditorGroup');
            }
            return this.postCreatePreview(preview);
        }
    }

    /**
     * Parse the data of a file identified by its URI.
     * If the document is already opened and the parser session exists, just return the existing session.
     * Otherwise, open the document to trigger the `onDidOpenTextDocument` event and then, return 
     * a parser session created by the event listener.
     * @param uri URI of the file to be parsed.
     * @returns 
     */
    private async parseDataOfFileUri(uri: vscode.Uri): Promise<ParserResult> {
        const uriString = uri.toString();

        if (this.parserSessionMap.has(uriString)) {
            return this.parserSessionMap.get(uriString)!.promise;
        } else {
            // console.log('Try to open document without editor:', vscode.workspace.asRelativePath(uri));
            await vscode.workspace.openTextDocument(uri);
            // console.log('Try to use parser session for document without editor:', vscode.workspace.asRelativePath(uri));

            // It appears that the `workspace.openTextDocument(uri)` above immediately triggers the
            // `onDidOpenTextDocument` event and thus the newly created parser session exists after
            // this await function call.
            // If the trigger is delayed, this code will not work.
            // Use of `SetTimeout` or checking the existence of the parser session in a loop may 
            // be a safer way.
            return this.parserSessionMap.get(uriString)?.promise;
        }
    }

    /**
     * Register event handlers and then make a content from source.
     * @param preview Preview object created during deserialization process or `showPreview`-type action command.
     * @returns Preview object if succeeded in parsing a file or `undefined`.
     */
    private postCreatePreview(preview: Preview) {
        this.previews.push(preview);
        if (preview.mode === 'editor') {
            preview.panel.iconPath = new vscode.ThemeIcon('graph-line');
        } else {
            preview.panel.iconPath = new vscode.ThemeIcon('graph-scatter');
        }

        preview.panel.onDidDispose(() => {
            // console.log('Preview closed: ', vscode.workspace.asRelativePath(preview.uri));
            // Remove the closed preview from the array.
            const index = this.previews.findIndex(preview2 => preview2.panel === preview.panel);
            if (index >= 0) {
                this.previews.splice(index, 1);
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
                        // No information about x- and y-scales are available in this format.

                        // if (node.subtype !== 'matrix-xy' && node.subtype !== 'matrix-yx') { return; }

                        preview.panel.webview.postMessage({
                            type: 'updatePlot',
                            plotType: messageIn.plotType,
                            dataType: 'matrix',
                            graphNumber: messageIn.graphNumber,
                            transposed: node.subtype === 'matrix-yx',
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
                const scope = { languageId: preview.language, uri: preview.uri };
                const config = vscode.workspace.getConfiguration('spec-data.preview', scope);

                preview.panel.webview.postMessage({
                    type: 'setMode',
                    mode: preview.mode,
                } satisfies MessageToWebview);

                preview.panel.webview.postMessage({
                    type: 'enableEditorScroll',
                    flag: config.get<boolean>('scrollEditorWithPreview', true),
                } satisfies MessageToWebview);

                preview.panel.webview.postMessage({
                    type: 'setTemplate',
                    template: getPlotlyTemplate(vscode.window.activeColorTheme.kind, scope),
                    callback: 'newPlot',
                } satisfies MessageToWebview);

                preview.panel.webview.postMessage({
                    type: 'setScrollBehavior',
                    value: config.get<boolean>('smoothScrolling', false) ? 'smooth' : 'auto'
                } satisfies MessageToWebview);

                preview.panel.webview.postMessage({
                    type: 'restoreScroll',
                    delay: true,
                } satisfies MessageToWebview);
            }
        }, null, this.subscriptions);

        updateWebviewContent(preview, this.extensionUri);
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

        const parserResult = await this.parseDataOfFileUri(uri);
        if (parserResult?.nodes === undefined) {
            const message = vscode.l10n.t('Failed to parse file: "{0}"', vscode.workspace.asRelativePath(uri));
            vscode.window.showErrorMessage(message);
            return undefined;
        }

        preview.uri = uri;
        preview.language = parserResult.language;
        preview.nodes = parserResult.nodes;
        updateWebviewContent(preview, this.extensionUri);
        return preview;
    }
}

function updateWebviewContent(preview: Preview, extensionUri: vscode.Uri) {
    const webview = preview.panel.webview;
    const filePath = preview.uri.path;

    if (preview.mode === 'live') {
        preview.panel.title = vscode.l10n.t('Preview {0}', filePath.substring(filePath.lastIndexOf('/') + 1));
    } else if (preview.mode === 'locked') {
        preview.panel.title = vscode.l10n.t('[Preview] {0}', filePath.substring(filePath.lastIndexOf('/') + 1));
    }

    const nameLists: { [name: string]: string[] } = {};
    const mnemonicLists: { [name: string]: string[] } = {};

    const config = vscode.workspace.getConfiguration('spec-data.preview', { languageId: preview.language, uri: preview.uri });
    const hideTable = config.get<boolean>('table.hide', true);
    const columnsPerRow = config.get<number>('table.columnsPerRow', 8);
    const headerType = config.get<string>('table.headerType', 'Mnemonic');
    const maximumPlots = config.get<number>('plot.maximumNumberOfPlots', 25);
    const plotHeight = config.get<number>('plot.height', 400);

    // Apply CSP regardless of user settings when in untrusted workspaces.
    const metaCspStr = !vscode.workspace.isTrusted || config.get<boolean>('applyContentSecurityPolicy', true)
        ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob: data:; style-src 'unsafe-inline'; script-src ${webview.cspSource}; connect-src ${webview.cspSource};">`
        : '';

    function getSanitizedString(text: string) {
        // const charactersReplacedWith = ['&amp;', '&lt;', '&gt;', '&quot;', '&#39;'];
        // return text.replace(/[&<>"']/g, (match) => charactersReplacedWith['&<>"\''.indexOf(match)]);
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function getAttributesForNode(node: Node) {
        return `id="l${node.lineStart}" class="${node.type}"`;
    }

    const htmlHeader = `<!DOCTYPE html>
<html lang="en">
<head data-plot-height="${plotHeight}" data-source-uri="${preview.uri.toString()}" data-enable-multiple-selection="${Number(preview.enableMultipleSelection)}" data-enable-right-axis="${Number(preview.enableRightAxis)}">
	<meta charset="UTF-8">
    ${metaCspStr}
    <title>spec data Preview</title>
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="${webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'preview', 'node_modules', 'plotly.js-cartesian-dist-min', 'plotly-cartesian.min.js'))}" defer></script>
    <script src="${webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'preview', 'previewer.js'))}" defer></script>
</head>
<body>
`;
    const htmlFooter = `</body>
</html>
`;

    const lines: string[] = [];
    let scanDataCount = 0;

    for (const node of preview.nodes) {
        if (node.type === 'file') {
            lines.push(`<h1 ${getAttributesForNode(node)}>${getSanitizedString(node.value)}</h1>`);
        } else if (node.type === 'date') {
            lines.push(`<p ${getAttributesForNode(node)}><em>Date</em>: ${getSanitizedString(node.value)}</p>`);
        } else if (node.type === 'comment') {
            lines.push(`<p ${getAttributesForNode(node)}><em>#</em> ${getSanitizedString(node.value)}</p>`);
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
            lines.push(`<div ${getAttributesForNode(node)}><div class="valueListDiv">`);
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

                for (let row = 0; row < Math.ceil(valueList.length / columnsPerRow); row++) {
                    if (headerList) {
                        const headerListInRow = headerList.slice(row * columnsPerRow, Math.min((row + 1) * columnsPerRow, headerList.length));
                        lines.push(`<tr>${headerListInRow.map(item => `<td><strong>${item}</td></strong>`).join('')}</tr>`);
                    }
                    const valueListInRow = valueList.slice(row * columnsPerRow, Math.min((row + 1) * columnsPerRow, valueList.length));
                    lines.push(`<tr>${valueListInRow.map(item => `<td>${item}</td>`).join('')}</tr>`);
                }
                lines.push(`</table>`);
            }
            lines.push(`</div></div>`);
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
            } else { // 'matrix-xy' | 'matrix-yx'
                modes = [{ label: 'line', value: node.subtype === 'matrix-xy' ? 'line-y' : 'line-xy' }];
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

            lines.push(`<div ${getAttributesForNode(node)}><div class="scanDataDiv">`);
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
            lines.push(`</div></div>`);
        } else if (node.type === 'unknown') {
            if (preview.language !== SPEC_DATA_FILTER.language) {
                lines.push(`<p ${getAttributesForNode(node)}><em>${getSanitizedString(node.kind)}</em> ${getSanitizedString(node.value)}</p>`);
            }
        }
    }

    preview.panel.webview.html = htmlHeader + lines.join('\n') + htmlFooter;
}

function getPlotlyTemplate(kind: vscode.ColorThemeKind, scope?: vscode.ConfigurationScope): Template {
    const config = vscode.workspace.getConfiguration('spec-data.preview.plot', scope);
    const colorscale = config.get<string>('colorScale', 'RdBu');
    // const height = config.get<number>('height', 400);
    const userDataTemplate = config.get<{ [key in ColorThemeKindLabel]?: NonNullable<Template['data']> }>('template.data', {});
    const userLayoutTemplate = config.get<{ [key in ColorThemeKindLabel]?: NonNullable<Template['layout']> }>('template.layout', {});
    const additionalDataTemplate: NonNullable<Template['data']> = {
        heatmap: [{ colorscale }], contour: [{ colorscale }],
    };

    let colorLabel: ColorThemeKindLabel;
    switch (kind) {
        case vscode.ColorThemeKind.Light:
            colorLabel = 'light';
            break;
        case vscode.ColorThemeKind.Dark:
            colorLabel = 'dark';
            break;
        case vscode.ColorThemeKind.HighContrast:
            colorLabel = 'highContrast';
            break;
        case vscode.ColorThemeKind.HighContrastLight:
            colorLabel = 'highContrastLight';
            break;
        default:
            // This case will not be hit. Return an empty template to satisfy the return type.
            return {};
    }

    // Shallow merge the default template and user template.
    const dataTemplate: NonNullable<Template['data']> =
        colorLabel in userDataTemplate ?
            { ...defaultDataTemplate[colorLabel], ...additionalDataTemplate, ...userDataTemplate[colorLabel] } :
            { ...defaultDataTemplate[colorLabel], ...additionalDataTemplate };

    const layoutTemplate: NonNullable<Template['layout']> =
        colorLabel in userLayoutTemplate ?
            { ...defaultLayoutTemplate[colorLabel], ...userLayoutTemplate[colorLabel] } :
            defaultLayoutTemplate[colorLabel];
    // { ...defaultLayoutTemplate[colorLabel], height, ...userLayoutTemplate[colorLabel] } :
    // { ...defaultLayoutTemplate[colorLabel], height };

    return { data: dataTemplate, layout: layoutTemplate };
}
