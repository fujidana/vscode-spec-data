import * as vscode from 'vscode';
import { TextDecoder } from 'util';
import { parse } from 'path';

const SCAN_SELECTOR = { scheme: 'file', language: 'spec-scan' };

type Node = FileNode | DateNode | CommentNode | NameListNode | ValueListNode | ScanHeadNode | ScanDataNode | UnknownNode;
type BaseNode = { type: string, lineStart: number, lineEnd: number, occurance?: number };
type FileNode = BaseNode & { type: 'file', value: string };
type DateNode = BaseNode & { type: 'date', value: string };
type CommentNode = BaseNode & { type: 'comment', value: string };
type NameListNode = BaseNode & { type: 'nameList', kind: string, values: string[], mnemonic: boolean };
type ValueListNode = BaseNode & { type: 'valueList', kind: string, values: number[] };
type ScanHeadNode = BaseNode & { type: 'scanHead', value: string, index: number, code: string };
type ScanDataNode = BaseNode & { type: 'scanData', rows: number, headers: string[], data: number[][] | null };
type UnknownNode = BaseNode & { type: 'unknown', kind: string, value: string };

interface Preview { uri: vscode.Uri, panel: vscode.WebviewPanel, tree?: Node[] }

/**
 * Provider class
 */
export class ScanProvider implements vscode.FoldingRangeProvider, vscode.DocumentSymbolProvider {
    previews: Preview[] = [];
    livePreview: Preview | undefined = undefined;
    plotlyJsUri: vscode.Uri;
    onDidChangeTextEditorVisibleRangesDisposable: vscode.Disposable | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.plotlyJsUri = vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'plotly.js-dist-min', 'plotly.min.js');

        // callback of 'vscode-spec-scan.showPreview'.
        const showPreviewCommand = async (...args: unknown[]) => {
            let [uri, text] = getUriAndText(args);
            if (uri) {
                this.showPreview(context, uri, text);
            }
        };

        // callback of 'vscode-spec-scan.showPreviewToSide'.
        const showPreviewToSideCommand = async (...args: unknown[]) => {
            let [uri, text] = getUriAndText(args);
            if (uri) {
                this.showPreview(context, uri, text, true);
            }
        };

        // callback of 'vscode-spec-scan.showSource'.
        const showSourceCommand = async (...args: unknown[]) => {
            const activePreview = this.getActivePreview();
            if (activePreview) {
                const document = await vscode.workspace.openTextDocument(activePreview.uri);
                vscode.window.showTextDocument(document);
            } else {
                vscode.window.showErrorMessage('Failed in finding active preview tab.');
            }
        };

        // callback of 'vscode-spec-scan.refreshPreview'.
        const refreshPreviewCommand = async (...args: unknown[]) => {
            const activePreview = this.getActivePreview();
            if (activePreview) {
                const editors = vscode.window.visibleTextEditors.filter(editor => editor.document.uri.toString() === activePreview.uri.toString());
                const text = editors.length ? editors[0].document.getText() : undefined;
                this.updatePreview(activePreview, activePreview.uri, text);
            } else {
                vscode.window.showErrorMessage('Failed in finding active preview tab.');
            }
        };

        // callback of 'vscode-spec-scan.togglePreviewLock'.
        const togglePreviewLockCommand = (...args: unknown[]) => {
            const activePreview = this.getActivePreview();
            if (activePreview) {
                const activeUriString = activePreview.uri.toString();
                if (this.livePreview && activePreview.panel === this.livePreview.panel) {
                    // If the active view is a live preview, lock the view to the file.
                    this.livePreview = undefined;
                    activePreview.panel.title = `[Preview] ${activeUriString.substring(activeUriString.lastIndexOf('/') + 1)}`;
                } else {
                    // If the active view is not a live preview...
                    if (this.livePreview) {
                        // close the current live view if it exists...
                        this.livePreview.panel.dispose();
                    }
                    // and set the active view to live view.
                    this.livePreview = activePreview;
                    activePreview.panel.title = `Preview ${activeUriString.substring(activeUriString.lastIndexOf('/') + 1)}`;
                }
            } else {
                vscode.window.showErrorMessage('Failed in finding active preview tab.');
            }
        };

        const onDidChangeActiveTextEditorListner = (editor: vscode.TextEditor | undefined) => {
            if (editor && editor.document.languageId === 'spec-scan' && editor.document.uri.scheme === 'file') {
                if (this.livePreview && this.livePreview.uri.toString() !== editor.document.uri.toString()) {
                    this.updatePreview(this.livePreview, editor.document.uri, editor.document.getText());
                }
            }
        };

        const onDidChangeTextEditorVisibleRangesListener = (event: vscode.TextEditorVisibleRangesChangeEvent) => {
            // event.textEditor.document.uri;
            if (event.visibleRanges.length) {
                const line = event.visibleRanges[0].start.line;
                const preview = this.previews.find(preview => preview.uri.toString() === event.textEditor.document.uri.toString());
                if (preview && preview.tree) {
                    const node = preview.tree.find(node => (node.lineEnd >= line));
                    if (node) {
                        preview.panel.webview.postMessage({ command: 'scrollTo', elementId: `l${node.lineStart}`});
                    }
                }
            }
        };

        const onDidChangeConfigurationListner = (event: vscode.ConfigurationChangeEvent) => {
            if (event.affectsConfiguration('vscode-spec-scan.preview.scrollPreviewWithEditor')) {
                const scrollPreviewWithEditor: boolean = vscode.workspace.getConfiguration('vscode-spec-scan.preview').get('scrollPreviewWithEditor', false);
                if (scrollPreviewWithEditor) {
                    if (!this.onDidChangeTextEditorVisibleRangesDisposable) {
                        this.onDidChangeTextEditorVisibleRangesDisposable = vscode.window.onDidChangeTextEditorVisibleRanges(onDidChangeTextEditorVisibleRangesListener);
                        context.subscriptions.push(this.onDidChangeTextEditorVisibleRangesDisposable);
                    }
                } else {
                    if (this.onDidChangeTextEditorVisibleRangesDisposable) {
                        const index = context.subscriptions.indexOf(this.onDidChangeTextEditorVisibleRangesDisposable);
                        if (index >=0) {
                            context.subscriptions.splice(index, 1);
                        }
                        this.onDidChangeTextEditorVisibleRangesDisposable.dispose();
                    };
                    this.onDidChangeTextEditorVisibleRangesDisposable = undefined;
                }
                console.log(context.subscriptions.length);
            }
        };

        // register providers and commands
        context.subscriptions.push(
            vscode.commands.registerCommand('vscode-spec-scan.showPreview', showPreviewCommand),
            vscode.commands.registerCommand('vscode-spec-scan.showPreviewToSide', showPreviewToSideCommand),
            vscode.commands.registerCommand('vscode-spec-scan.showSource', showSourceCommand),
            vscode.commands.registerCommand('vscode-spec-scan.refreshPreview', refreshPreviewCommand),
            vscode.commands.registerCommand('vscode-spec-scan.togglePreviewLock', togglePreviewLockCommand),
            vscode.languages.registerFoldingRangeProvider(SCAN_SELECTOR, this),
            vscode.languages.registerDocumentSymbolProvider(SCAN_SELECTOR, this),
            vscode.window.onDidChangeActiveTextEditor(onDidChangeActiveTextEditorListner),
            vscode.workspace.onDidChangeConfiguration(onDidChangeConfigurationListner)
        );
        
        const scrollPreviewWithEditor: boolean = vscode.workspace.getConfiguration('vscode-spec-scan.preview').get('scrollPreviewWithEditor', false);
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

    private async showPreview(context: vscode.ExtensionContext, sourceUri: vscode.Uri, text: string | undefined, showToSide: boolean = false) {
        if (this.livePreview) {
            // If a live preview panel exists...
            if (this.livePreview.uri.toString() !== sourceUri.toString()) {
                // Update the content if the URLs are different.
                this.updatePreview(this.livePreview, sourceUri, text);
            }
            this.livePreview.panel.reveal();
            return true;
        } else {
            // Else create a new panel as a live panel.
            const panel = vscode.window.createWebviewPanel(
                'specScanPreview',
                'Preview spec scan',
                showToSide ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active,
                {
                    localResourceRoots: [context.extensionUri],
                    enableScripts: true
                }
            );
            const newPreview = { uri: sourceUri, panel: panel };
            this.previews.push(newPreview);
            this.livePreview = newPreview;

            panel.onDidDispose(() => {
                vscode.commands.executeCommand('setContext', 'vscode-spec-scan.previewEditorActive', false);
                // remove the closed preview from the array.
                this.previews.filter(preview => preview !== newPreview);
                if (this.livePreview && panel === this.livePreview.panel) {
                    this.livePreview = undefined;
                }
            }, null, context.subscriptions);

            panel.onDidChangeViewState((event) => {
                vscode.commands.executeCommand('setContext', 'vscode-spec-scan.previewEditorActive', event.webviewPanel.active);
            }, null, context.subscriptions);

            this.updatePreview(newPreview, sourceUri, text);

            return panel;
        }
    }

    private async updatePreview(preview: Preview, sourceUri: vscode.Uri, text: string | undefined) {
        // first, parse the document contents. Simultaneously load the contents if the file is not yet opened.
        const tree = parseScanFileContents(text ? text : new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(sourceUri)));
        if (!tree) {
            vscode.window.showErrorMessage('Failed in parsing the document.');
            return false;
        }

        const webview = preview.panel.webview;
        const label = (this.livePreview && this.livePreview === preview) ? 'Preview' : '[Preview]';

        preview.uri = sourceUri;
        preview.tree = tree;
        preview.panel.title = `${label} ${sourceUri.path.substring(sourceUri.path.lastIndexOf('/') + 1)}`;
        preview.panel.webview.html = getWebviewContent(webview.cspSource, webview.asWebviewUri(this.plotlyJsUri), tree);

        return true;
    }

    private getActivePreview(): Preview | undefined {
        return this.previews.find(preview => preview.panel.active);
    }
}

function getUriAndText(args: unknown[]): [vscode.Uri | undefined, string | undefined] {
    if (args && args.length > 0 && args[0] instanceof vscode.Uri) {
        // If the URI is provided via the arguments, returns the URI.
        // If there is an corresponding editor, use its contents.
        const uri = args[0];
        const editors = vscode.window.visibleTextEditors.filter(editor => editor.document.uri.toString() === uri.toString());
        if (editors.length) {
            return [uri, editors[0].document.getText()];
        } else {
            return [uri, undefined];
        }
    } else {
        // If the URI is not provided via the arguments, returns the URI and contents of the active editor.
        // If there is no active editor, return [unndefined, undefined].
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            return [editor.document.uri, editor.document.getText()];
        } else {
            vscode.window.showErrorMessage('Active editor is not found.');
            return [undefined, undefined];
        }
    }
}

function parseScanFileContents(text: string): Node[] | undefined {
    const lines = text.split('\n');
    const lineCount = lines.length;

    const fileRegex = /^(#F) (.*)$/;
    const dateRegex = /^(#D) (.*)$/;
    const commentRegex = /^(#C) (.*)$/;
    const nameListRegex = /^(?:#([OJoj])([0-9]+)) (.*)$/;
    const valueListRegex = /^(?:#([P])([0-9]+)) (.*)$/;
    const scanHeadRegex = /^(#S) (([0-9]+) (.*))$/;
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
            nodes.push({ type: 'scanHead', lineStart: lineIndex, lineEnd: lineIndex, occurance: scanHeadOccurance, value: matched[2], index: parseInt(matched[3]), code: matched[4] });
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
            const dataNode: ScanDataNode = { type: 'scanData', lineStart: lineIndex, lineEnd: lineIndex, occurance: scanDataOccurance, rows: rowNumber, headers: headers, data: null };
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

function getWebviewContent(cspSource: string, plotlyUri: vscode.Uri, nodes: Node[]): string {
    let scanDescription = '';
    let nameLists: { [name: string]: string[] } = {};
    let mnemonicLists: { [name: string]: string[] } = {};

    const config = vscode.workspace.getConfiguration('vscode-spec-scan.preview');
    const hideTable: boolean = config.get('table.hide', true);
    const columnsPerLine: number = config.get('table.columnsPerLine', 8);
    const headerType: string = config.get('table.headerType', 'mnemonic');
    const maximumPlots: number = config.get('plot.maximumNumberOfPlots', 50);
    const plotHeight: number = config.get('plot.height', 400);

    // const themeKind = vscode.window.activeColorTheme.kind;

    const header = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
    <!--
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https:; style-src ${cspSource}; script-src 'unsafe-inline' ${cspSource};">
    -->
    <title>Preview spec scan</title>
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="${plotlyUri}"></script>
    <script>
        function hideElement(elemId, flag) {
            document.getElementById(elemId).hidden = flag;
        }

        function resizeBody() {
            const elements = document.body.getElementsByClassName('scanDataPlot');
            for (const element of elements) {
                Plotly.relayout(element.id, { width: document.body.clientWidth * 0.9 });
            }
        }

        window.addEventListener('message', event => {
            const message = event.data;

            if (message.command ===  'scrollTo') {
                const element = document.getElementById(message.elementId);
                if (element) {
                    element.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });

    </script>
</head>
<body onresize="resizeBody()">
`;
    const printNodeId = function(node: Node) {
        return `id="l${node.lineStart}" class="${node.type}"`;
    };

    let body = "";
    for (const node of nodes) {
        if (node.type === 'file') {
            body += `<h1 ${printNodeId(node)}>File: ${node.value}</h1>`;
        } else if (node.type === 'date') {
            body += `<p ${printNodeId(node)}>Date: ${node.value}</p>`;
        } else if (node.type === 'comment') {
            body += `<p ${printNodeId(node)}>Comment: ${node.value}</p>`;
        } else if (node.type === 'nameList') {
            if (node.mnemonic) {
                mnemonicLists[node.kind] = node.values;
            } else {
                nameLists[node.kind] = node.values;
            }
        } else if (node.type === 'scanHead') {
            scanDescription = node.value;
            body += `<h2 ${printNodeId(node)}>Scan ${node.index}: <code>${node.code}</code></h2>`;
        } else if (node.type === 'valueList') {
            const valueList = node.values;
            const headerList = (headerType === 'Name') ? nameLists['motor'] : (headerType === 'Mnemonic') ? mnemonicLists['motor'] : undefined;
            body += `<div ${printNodeId(node)}>`;
            if (headerList && (headerList.length !== valueList.length)) {
                body += '<p><em>The number of scan headers and data columns mismatched.</em></p>';
            } else {
                body += `<p>
<input type="checkbox" ${hideTable ? ' checked' : ''} id="valueListCheckbox${node.occurance}" onclick="hideElement('valueListTable${node.occurance}', this.checked)">
<label for="valueListCheckbox${node.occurance}">Hide Table</label>
</p>
<table ${hideTable ? ' hidden' : ''} id="valueListTable${node.occurance}">
<caption>${node.kind}</caption>
`;
                for (let row = 0; row < Math.ceil(valueList.length / columnsPerLine); row++) {
                    if (headerList) {
                        body += `<tr>`;
                        for (let col = 0; col < columnsPerLine && row * columnsPerLine + col < valueList.length; col++) {
                            body += `<td><strong>${headerList[row * columnsPerLine + col]}</<strong></td>`;
                        }
                        body += `</tr>`;
                    }
                    body += `<tr>`;
                    for (let col = 0; col < columnsPerLine && row * columnsPerLine + col < valueList.length; col++) {
                        body += `<td>${valueList[row * 8 + col]}</td>`;
                    }
                    body += `</tr>`;
                }
                body += `</table>`;
            }
            body += `</div>`;
        } else if (node.type === 'scanData') {
            const data: number[][] | null = node.data;
            const rows: number = node.rows;

            body += `<div ${printNodeId(node)}>`;
            // skip empty scan list (cancelled immediately after scan start)
            if (node.occurance && node.occurance >= maximumPlots) {
                body += `<p><em>Too many Plots!</em> The plot is ommited for the performance reason.</p>`;
                continue;
            } else if (data && data.length) {
                body += `<div id="plotly${node.occurance}" class="scanDataPlot"></div>`;
                body += `<script>
Plotly.newPlot("plotly${node.occurance}", {
    data: [{
        x: ${JSON.stringify(data[0])},
        y: ${JSON.stringify(data[rows - 1])}
    }],
    layout: {
        width: document.body.clientWidth * 0.9,
        height: ${plotHeight},
        xaxis: { title: "${node.headers[0]}" },
        yaxis: { title: "${node.headers[rows - 1]}" },
        margin: { t:20, r: 20 }
    }
})
</script>
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

    // "title": "${scanDescription}",
    return header + body;
}