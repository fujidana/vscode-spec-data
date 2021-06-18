import * as vscode from 'vscode';
import { TextDecoder } from 'util';

const SCAN_SELECTOR = { scheme: 'file', language: 'spec-scan' };

/**
 * Provider class
 */
export class ScanProvider implements vscode.FoldingRangeProvider, vscode.DocumentSymbolProvider {
    panels: Map<string, vscode.WebviewPanel> = new Map();

    constructor(context: vscode.ExtensionContext) {
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

        const showSourceCommand = async (...args: unknown[]) => {
            const preview = this.getActivePreview();
            if (preview) {
                const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(preview[0]));
                vscode.window.showTextDocument(document);
            }
        };

        // register providers and commands
        context.subscriptions.push(
            vscode.commands.registerCommand('vscode-spec-scan.showPreview', showPreviewCommand),
            vscode.commands.registerCommand('vscode-spec-scan.showPreviewToSide', showPreviewToSideCommand),
            vscode.commands.registerCommand('vscode-spec-scan.showSource', showSourceCommand),
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

        if (this.panels.has(sourceUriString)) {
            // show a panel corresponding to the `sourceUri` if it exists.
            const panel = this.panels.get(sourceUriString)!;
            panel.reveal();
            return panel;
        } else {
            // else create a new panel.

            // first, parse the document contents. Simultaneously load the contents if the filenot yet opened.
            let parsed;
            if (contents) {
                parsed = parseTextDocument(contents);
            } else {
                parsed = parseTextDocument(new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(sourceUri)));
            }
   
            if (!parsed) {
                vscode.window.showErrorMessage('Failed in parsing the document.');
                return undefined;
            }
            const panel = vscode.window.createWebviewPanel(
                'specScanPreview',
                'Preview spec scan',
                showToSide ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active,
                {
                    localResourceRoots: [context.extensionUri],
                    enableScripts: true
                }
            );
            this.panels.set(sourceUriString,  panel);

            panel.onDidDispose(() => {
                vscode.commands.executeCommand('setContext', 'vscode-spec-scan.previewEditorActive', false);
                this.panels.delete(sourceUriString);
            }, null, context.subscriptions);

            panel.onDidChangeViewState((event) => {
                vscode.commands.executeCommand('setContext', 'vscode-spec-scan.previewEditorActive', event.webviewPanel.active);
            }, null, context.subscriptions);

            const plotlyJsUri = vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'plotly.js-dist-min', 'plotly.min.js');
        
            panel.title = `Preview ${sourceUri.path.substring(sourceUri.path.lastIndexOf('/') + 1)}`;
            initWebviewContent(panel, plotlyJsUri, parsed);
        
            return panel;

        }
    }

    private getActivePreview(): [string, vscode.WebviewPanel] | undefined {
        for (const [uriString, panel] of this.panels) {
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
    const nameListRegex = /^(?:#([OJ])([0-9]+)) (.*)$/;
    const mnemonicListRegex = /^(?:#([oj])([0-9]+)) (.*)$/;
    const valueListRegex = /^(?:#([P])([0-9]+)) (.*)$/;
    const scanRegex = /^(#S) (([0-9]+) (.*))$/;
    const scanNumberRegex = /^(#N) ([0-9]+)$/;
    const scanListRegex = /^(#L) (.*)$/;
    const allRegex = /^(#[a-zA-Z][0-9]*) (.*)$/;
    const emptyLineRegex = /^\s*$/;

    let matched: RegExpMatchArray | null;
    let rowNumber = 0;
    const objects = [];

    for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
        const lineText = lines[lineIndex];
        if (matched = lineText.match(fileRegex)) {
            objects.push({ key: 'file', value: matched[2] });
        } else if (matched = lineText.match(dateRegex)) {
            objects.push({ key: 'date', value: matched[2] });
        } else if (matched = lineText.match(commentRegex)) {
            objects.push({ key: 'comment', value: matched[2] });
        } else if (matched = lineText.match(nameListRegex)) {
            let nameType;
            if (matched[1] === 'O') {
                nameType = 'motor';
            } else if (matched[1] === 'J') {
                nameType = 'counter';
            } else {
                nameType = matched[1];
            }
            const listIndex = parseInt(matched[2]);
            const prevObj: any = objects[objects.length - 1];
            if (prevObj['key'] === 'nameList' && prevObj['type'] === nameType) {
                if (prevObj['index'] === listIndex - 1) {
                    prevObj['list'].push(...(matched[3].trimEnd().split('  ')));
                    prevObj['index'] = listIndex;
                }
            } else {
                if (listIndex === 0) {
                    objects.push({ key: 'nameList', type: nameType, 'index': listIndex, 'list': matched[3].trimEnd().split('  ') });
                }
            }
        } else if (matched = lineText.match(mnemonicListRegex)) {
            let type;
            if (matched[1] === 'o') {
                type = 'motor';
            } else if (matched[1] === 'j') {
                type = 'counter';
            } else {
                type = matched[1];
            }
            const listIndex = parseInt(matched[2]);
            const prevObj: any = objects[objects.length - 1];
            if (prevObj['key'] === 'mnemonicList' && prevObj['type'] === type) {
                if (prevObj['index'] === listIndex - 1) {
                    prevObj['list'].push(...(matched[3].trimEnd().split(' ')));
                    prevObj['index'] = listIndex;
                }
            } else {
                if (listIndex === 0) {
                    objects.push({ key: 'mnemonicList', type: type, 'index': listIndex, 'list': matched[3].trimEnd().split(' ') });
                }
            }
        } else if (matched = lineText.match(valueListRegex)) {
            let type;
            if (matched[1] === 'P') {
                type = 'motor';
            } else {
                type = matched[1];
            }
            const listIndex = parseInt(matched[2]);
            const prevObj: any = objects[objects.length - 1];
            if (prevObj['key'] === 'valueList' && prevObj['type'] === type) {
                if (prevObj['index'] === listIndex - 1) {
                    prevObj['list'].push(...(matched[3].trimEnd().split(' ').map(value => parseFloat(value))));
                    prevObj['index'] = listIndex;
                }
            } else {
                if (listIndex === 0) {
                    objects.push({ key: 'valueList', type: type, 'index': listIndex, 'list': matched[3].trimEnd().split(' ').map(value => parseFloat(value)) });
                }
            }
        } else if (matched = lineText.match(scanRegex)) {
            objects.push({ key: 'scan', value: matched[2], number: matched[3], code: matched[4] });
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
                objects.push({ key: 'scanList', rows: rowNumber, headers: headers, data: data2 });
            } else {
                objects.push({ key: 'scanList', rows: rowNumber, headers: headers, data: null });
            }

        }
    }
    return objects;
}

function initWebviewContent(panel: vscode.WebviewPanel, plotlyUri: vscode.Uri, objects: any[]) {
    let scanDescription = '';
    let nameLists: { [name: string]: string[] } = {};
    let mnemonicLists: { [name: string]: string[] } = {};
    let plotInd = 0;

    const webview = panel.webview;

    const config = vscode.workspace.getConfiguration('vscode-spec-scan.preview');
    const maximumPlots: number = config.get('maximumPlots', 100);
    const columnsPerLine: number = config.get('table.columnsPerLine', 8);
    const headerType: string = config.get('table.headerType', 'mnemonic');
    const plotWidth: number = config.get('plot.width', 600);
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
</head>
<body>
`;

    const footer = `</body>
</html>
`;
    let body = "";
    for (const object of objects) {
        if (object['key'] === 'file') {
            body += `<h1>File: ${object['value']}</h1>`;
        } else if (object['key'] === 'date') {
            body += `<p>Date: ${object['value']}</p>`;
        } else if (object['key'] === 'comment') {
            body += `<p>Comment: ${object['value']}</p>`;
        } else if (object['key'] === 'nameList') {
            nameLists[object['type']] = object['list'];
        } else if (object['key'] === 'mnemonicList') {
            mnemonicLists[object['type']] = object['list'];
        } else if (object['key'] === 'scan') {
            scanDescription = object['value'];
            body += `<h2>Scan ${object['number']}: <code>${object['code']}</code></h2>`;
        } else if (object['key'] === 'valueList') {
            if (headerType === 'None') {
                // do nothing
            } else {
                const valueList = object['list'];
                const headerList = (headerType === 'Value Only') ? undefined : (headerType === 'Mnemonic') ? mnemonicLists['motor'] : nameLists['motor'];
                if (headerList && (headerList.length !== valueList.length)) {
                    body += '<p><em>The number of scan headers and data columns mismatched.</c></p>';
                } else  {
                    body += `<table><caption>${object['type']}</caption>`;
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
            }

        } else if (object['key'] === 'scanList') {
            const data: number[][] | null = object['data'];
            const rows: number = object['rows'];

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
    "data": [{
        "x": ${JSON.stringify(data[0])},
        "y": ${JSON.stringify(data[rows - 1])}
    }],
    "layout": {
        "width": ${plotWidth},
        "height": ${plotHeight},
        "xaxis": { "title": "${object['headers'][0]}" },
        "yaxis": { "title": "${object['headers'][rows - 1]}" },
        "margin": { "t": 0 }
    }
})
</script>
`;
                plotInd++;
            }
        }
    }
    // "title": "${scanDescription}",
    webview.html = header + body + footer;
}
