import * as vscode from 'vscode';
import { TextDecoder } from 'util';

const SCAN_SELECTOR = { scheme: 'file', language: 'spec-scan' };

type Node = FileNode | DateNode | CommentNode | NameListNode |  ValueListNode | ScanNode | ScanDataNode | UnknownNode;
type FileNode = { type: 'file', value: string };
type DateNode = { type: 'date', value: string };
type CommentNode = { type: 'comment', value: string };
type NameListNode = { type: 'nameList', kind: string, index: number, values: string[], mnemonic: boolean };
type ValueListNode = { type: 'valueList', kind: string, index: number, values: number[] };
type ScanNode = { type: 'scan', value: string, index: number, code: string };
type ScanDataNode = { type: 'scanList', rows: number, headers: string[], data: number[][] | null };
type UnknownNode = { type: 'unknown', kind: string, value: string };

/**
 * Provider class
 */
export class ScanProvider implements vscode.FoldingRangeProvider, vscode.DocumentSymbolProvider {
    previews: [string, vscode.WebviewPanel][] = [];
    livePreview: [string, vscode.WebviewPanel] | undefined = undefined;
    plotlyJsUri: vscode.Uri;

    constructor(context: vscode.ExtensionContext) {
        this.plotlyJsUri = vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'plotly.js-dist-min', 'plotly.min.js');

        // callback of 'vscode-spec-scan.showPreview'.
        const showPreviewCommand = async (...args: unknown[]) => {
            let [sourceUri, contents] = getUriAndContents(args);
            if (sourceUri) {
                this.showWebViewPanel(context, sourceUri, contents);
            }
        };

        // callback of 'vscode-spec-scan.showPreviewToSide'.
        const showPreviewToSideCommand = async (...args: unknown[]) => {
            let [sourceUri, contents] = getUriAndContents(args);
            if (sourceUri) {
                this.showWebViewPanel(context, sourceUri, contents, true);
            }
        };

        // callback of 'vscode-spec-scan.showSource'.
        const showSourceCommand = async (...args: unknown[]) => {
            const activePreview = this.getActivePreview();
            if (activePreview) {
                const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(activePreview[0]));
                vscode.window.showTextDocument(document);
            } else {
                vscode.window.showErrorMessage('Failed in finding active preview tab.');
            }
        };

        // callback of 'vscode-spec-scan.refreshPreview'.
        const refreshPreviewCommand = async (...args: unknown[]) => {
            const activePreview = this.getActivePreview();
            if (activePreview) {
                const [activeUriString, activePanel] = activePreview;
                const editors = vscode.window.visibleTextEditors.filter(editor => editor.document.uri.toString() === activeUriString);
                const contents = editors.length ? editors[0].document.getText() : undefined;
                const isLocked = !(this.livePreview && this.livePreview[1] === activePanel);
                this.updateWebViewPanel(activePanel, vscode.Uri.parse(activeUriString), contents, isLocked);
            } else {
                vscode.window.showErrorMessage('Failed in finding active preview tab.');
            }
        };

        const setPreviewLockCommand = (...args: unknown[]) => {
            const activePreview = this.getActivePreview();
            if (activePreview) {
                const [activeUriString, activePanel] = activePreview;
                if (this.livePreview) {
                    if (activePanel === this.livePreview[1]) {
                        // If the active view is a live preview, lock the view to the file.
                        this.livePreview = undefined;
                        activePanel.title = `[Preview] ${activeUriString.substring(activeUriString.lastIndexOf('/') + 1)}`;
                    } else {
                        // If the active view is not a live preview, close the current live view and set the active view to live view.
                        this.livePreview[1].dispose();
                        this.livePreview = activePreview;
                        activePanel.title = `Preview ${activeUriString.substring(activeUriString.lastIndexOf('/') + 1)}`;
                    }
                } else {
                    // If there is no live view, the active view must be a locked view. Set the view to live view.
                    this.livePreview = activePreview;
                    activePanel.title = `Preview ${activeUriString.substring(activeUriString.lastIndexOf('/') + 1)}`;
                }
            } else {
                vscode.window.showErrorMessage('Failed in finding active preview tab.');
            }
        };

        // register providers and commands
        context.subscriptions.push(
            vscode.commands.registerCommand('vscode-spec-scan.showPreview', showPreviewCommand),
            vscode.commands.registerCommand('vscode-spec-scan.showPreviewToSide', showPreviewToSideCommand),
            vscode.commands.registerCommand('vscode-spec-scan.showSource', showSourceCommand),
            vscode.commands.registerCommand('vscode-spec-scan.refreshPreview', refreshPreviewCommand),
            vscode.commands.registerCommand('vscode-spec-scan.togglePreviewLock', setPreviewLockCommand),
            vscode.languages.registerFoldingRangeProvider(SCAN_SELECTOR, this),
            vscode.languages.registerDocumentSymbolProvider(SCAN_SELECTOR, this),
        );
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

    private async showWebViewPanel(context: vscode.ExtensionContext, sourceUri: vscode.Uri, contents: string | undefined, showToSide: boolean = false) {
        const sourceUriString = sourceUri.toString();

        if (this.livePreview) {
            const [liveUriString, livePanel] = this.livePreview;

            if (liveUriString !== sourceUriString) {
                this.updateWebViewPanel(livePanel, sourceUri, contents);
            }
            livePanel.reveal();
            return livePanel;
        } else {
            // else create a new panel.
            const livePanel = vscode.window.createWebviewPanel(
                'specScanPreview',
                'Preview spec scan',
                showToSide ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active,
                {
                    localResourceRoots: [context.extensionUri],
                    enableScripts: true
                }
            );
            this.previews.push([sourceUriString, livePanel]);
            this.livePreview = [sourceUriString, livePanel];

            livePanel.onDidDispose(() => {
                vscode.commands.executeCommand('setContext', 'vscode-spec-scan.previewEditorActive', false);
                // remove the closed preview from the array.
                this.previews = this.previews.filter(([uriString, panel]) => (sourceUriString !== uriString || livePanel !== panel));
                if (this.livePreview && livePanel === this.livePreview[1]) {
                    this.livePreview = undefined;
                }
            }, null, context.subscriptions);

            livePanel.onDidChangeViewState((event) => {
                vscode.commands.executeCommand('setContext', 'vscode-spec-scan.previewEditorActive', event.webviewPanel.active);
            }, null, context.subscriptions);

            this.updateWebViewPanel(livePanel, sourceUri, contents);

            return livePanel;
        }
    }

    private async updateWebViewPanel(panel: vscode.WebviewPanel, sourceUri: vscode.Uri, contents: string | undefined, isLocked: boolean = false) {
        // first, parse the document contents. Simultaneously load the contents if the filenot yet opened.
        let parsed;
        if (contents) {
            parsed = parseTextDocument(contents);
        } else {
            parsed = parseTextDocument(new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(sourceUri)));
        }

        if (!parsed) {
            vscode.window.showErrorMessage('Failed in parsing the document.');
            return false;
        }
        const label = isLocked ? '[Preview]' : 'Preview';
        panel.title = `${label} ${sourceUri.path.substring(sourceUri.path.lastIndexOf('/') + 1)}`;
        initWebviewContent(panel, this.plotlyJsUri, parsed);
        return true;
    }

    private getActivePreview(): [string, vscode.WebviewPanel] | undefined {
        for (const [uriString, panel] of this.previews) {
            if (panel.active) {
                return [uriString, panel];
            }
        }
    }
}

function getUriAndContents(args: unknown[]): [vscode.Uri | undefined, string | undefined] {
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

function parseTextDocument(contents: string) {
    const lines = contents.split('\n');
    const lineCount = lines.length;
    const fileRegex = /^(#F) (.*)$/;
    const dateRegex = /^(#D) (.*)$/;
    const commentRegex = /^(#C) (.*)$/;
    const nameListRegex = /^(?:#([OJoj])([0-9]+)) (.*)$/;
    const valueListRegex = /^(?:#([P])([0-9]+)) (.*)$/;
    const scanRegex = /^(#S) (([0-9]+) (.*))$/;
    const scanNumberRegex = /^(#N) ([0-9]+)$/;
    const scanListRegex = /^(#L) (.*)$/;
    const allRegex = /^#([a-zA-Z][0-9]*) (.*)$/;
    const emptyLineRegex = /^\s*$/;

    let matched: RegExpMatchArray | null;
    let rowNumber = 0;
    const nodes: Node[] = [];

    for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
        const lineText = lines[lineIndex];
        if (matched = lineText.match(fileRegex)) {
            nodes.push({ type: 'file', value: matched[2] });
        } else if (matched = lineText.match(dateRegex)) {
            nodes.push({ type: 'date', value: matched[2] });
        } else if (matched = lineText.match(commentRegex)) {
            nodes.push({ type: 'comment', value: matched[2] });
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
            const prevNode: Node = nodes[nodes.length - 1];
            if (prevNode && prevNode.type === 'nameList' && prevNode.kind === kind && prevNode.mnemonic === isMnemonic) {
                if (prevNode.index !== listIndex - 1) {
                    vscode.window.showErrorMessage(`Inconsequent index of the name list: line ${lineIndex + 1}`);
                    return undefined;
                }
                prevNode.values.push(...(matched[3].trimEnd().split(separator)));
                prevNode.index = listIndex;
            } else {
                if (listIndex !== 0) {
                    vscode.window.showErrorMessage(`The name list not starding with 0: line ${lineIndex + 1}`);
                    return undefined;
                }
                nodes.push({ type: 'nameList', kind: kind, index: listIndex, values: matched[3].trimEnd().split(separator), mnemonic: isMnemonic });
            }
        } else if (matched = lineText.match(valueListRegex)) {
            let kind;
            if (matched[1] === 'P') {
                kind = 'motor';
            } else {
                kind = matched[1];
            }
            const listIndex = parseInt(matched[2]);
            const prevNode: Node = nodes[nodes.length - 1];
            if (prevNode.type === 'valueList' && prevNode.kind === kind) {
                if (prevNode.index !== listIndex - 1) {
                    vscode.window.showErrorMessage(`Inconsequent index of the value list: line ${lineIndex + 1}`);
                    return undefined;
                }
                prevNode.values.push(...(matched[3].trimEnd().split(' ').map(value => parseFloat(value))));
                prevNode.index = listIndex;
            } else {
                if (listIndex !== 0) {
                    vscode.window.showErrorMessage(`The value list not starding with 0: line ${lineIndex + 1}`);
                    return undefined;
                }
                nodes.push({ type: 'valueList', kind: kind, index: listIndex, values: matched[3].trimEnd().split(' ').map(value => parseFloat(value)) });
            }
        } else if (matched = lineText.match(scanRegex)) {
            nodes.push({ type: 'scan', value: matched[2], index: parseInt(matched[3]), code: matched[4] });
        } else if (matched = lineText.match(scanNumberRegex)) {
            rowNumber = parseInt(matched[2]);
        } else if (matched = lineText.match(scanListRegex)) {
            // The separator between motors and counters are 4 whitespaces.
            // The separator between respective motors and counters are 2 whitespaces.
            const headersMotCnt = matched[2].split('    ', 2);
            const headers = headersMotCnt.map(a => a.split('  ')).reduce((a, b) => a.concat(b));
            if (headers.length !== rowNumber) {
                vscode.window.showErrorMessage(`Scan number mismatched (header): line ${lineIndex + 1}`);
                return undefined;
            }
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
                const data2 = data[0].map((_, colIndex) => data.map(row => row[colIndex]));
                nodes.push({ type: 'scanList', rows: rowNumber, headers: headers, data: data2 });
            } else {
                nodes.push({ type: 'scanList', rows: rowNumber, headers: headers, data: null });
            }
        } else if (matched = lineText.match(allRegex)) {
            nodes.push({ type: 'unknown', kind: matched[1], value: matched[2] });
        }
    }
    return nodes;
}

function initWebviewContent(panel: vscode.WebviewPanel, plotlyUri: vscode.Uri, nodes: Node[]) {
    let scanDescription = '';
    let nameLists: { [name: string]: string[] } = {};
    let mnemonicLists: { [name: string]: string[] } = {};
    let tableInd = 0;
    let plotInd = 0;

    const webview = panel.webview;

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
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource}; script-src 'unsafe-inline' ${webview.cspSource};">
    -->
    <title>Preview spec scan</title>
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="${webview.asWebviewUri(plotlyUri)}"></script>
    <script>
        function hideElement(elemId, flag) {
            document.getElementById(elemId).hidden = flag;
        }
        function resizeBody() {
            for (let i = 0; i < ${maximumPlots}; i++) {
                const specScanElement = document.getElementById("specScan" + i);
                if (!specScanElement) {
                    break;
                }
                Plotly.relayout("specScan" + i, { width: document.body.clientWidth * 0.9 });
            }
        }
    </script>
</head>
<body onresize="resizeBody()">
`;

    const footer = `</body>
</html>
`;
    let body = "";
    for (const node of nodes) {
        if (node.type === 'file') {
            body += `<h1>File: ${node.value}</h1>`;
        } else if (node.type === 'date') {
            body += `<p>Date: ${node.value}</p>`;
        } else if (node.type === 'comment') {
            body += `<p>Comment: ${node.value}</p>`;
        } else if (node.type === 'nameList') {
            if (node.mnemonic) {
                mnemonicLists[node.kind] = node.values;
            } else {
                nameLists[node.kind] = node.values;
            }
        } else if (node.type === 'scan') {
            scanDescription = node.value;
            body += `<h2>Scan ${node.index}: <code>${node.code}</code></h2>`;
        } else if (node.type === 'valueList') {
            const valueList = node.values;
            const headerList = (headerType === 'Name') ? nameLists['motor'] : (headerType === 'Mnemonic') ? mnemonicLists['motor'] : undefined;
            if (headerList && (headerList.length !== valueList.length)) {
                body += '<p><em>The number of scan headers and data columns mismatched.</em></p>';
            } else {
                body += `<p>
<input type="checkbox" ${hideTable ? ' checked' : ''} id="tableChckbox${tableInd}" onclick="hideElement('table${tableInd}', this.checked)">
<label for="tableChckbox${tableInd}">Hide Table</label>
</p>
<table ${hideTable ? ' hidden' : ''} id="table${tableInd}">
<caption>${node['type']}</caption>
`;
                tableInd++;
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

        } else if (node.type === 'scanList') {
            const data: number[][] | null = node.data;
            const rows: number = node.rows;

            // skip empty scan list (cancelled immediately after scan start)
            if (data === null) {
                continue;
            } else if (plotInd >= maximumPlots) {
                body += `<p><em>Too many Plots!</em> The plot is ommited for the performance reason.</p>`;
                continue;
            }
            body += `<div id="specScan${plotInd}"></div>`;
            if (data.length > 0) {
                body += `<script>
Plotly.newPlot("specScan${plotInd}", /* JSON object */ {
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
                plotInd++;
            }
        // } else if (node.type === 'unknown') {
        //     body += `<p> #${node.kind} ${node.value}`;
        }
    }
    // "title": "${scanDescription}",
    webview.html = header + body + footer;
}
