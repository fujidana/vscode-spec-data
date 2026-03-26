import * as vscode from 'vscode';
import { minimatch } from 'minimatch';

export const SPEC_DATA_FILTER = { language: 'spec-data' } as const;
export const CSV_COLUMNS_FILTER = { language: 'csv-column' } as const;
export const CSV_ROWS_FILTER = { language: 'csv-row' } as const;
export const DPPMCA_FILTER = { language: 'dppmca' } as const;
export const CHIPLOT_FILTER = { language: 'chiplot' } as const;

const CSV_DOCUMENT_SELECTOR = [CSV_COLUMNS_FILTER, CSV_ROWS_FILTER] as const;
// const CSV_LANGUAGES = CSV_DOCUMENT_SELECTOR.map(filter => filter.language);
// typeof CSV_LANGUAGES[number];
type CsvLanguage = typeof CSV_DOCUMENT_SELECTOR[number]['language'];

export const DOCUMENT_SELECTOR = [SPEC_DATA_FILTER, CSV_COLUMNS_FILTER, CSV_ROWS_FILTER, DPPMCA_FILTER, CHIPLOT_FILTER] as const;
const LANGUAGE_IDS = DOCUMENT_SELECTOR.map(filter => filter.language);
type SupportedLanguage = typeof LANGUAGE_IDS[number];

export type Node = FileNode | DateNode | CommentNode | NameListNode | ValueListNode | ScanHeadNode | ScanDataNode | UnknownNode;
interface BaseNode { type: string, lineStart: number, lineEnd: number }
interface FileNode extends BaseNode { type: 'file', value: string }
interface DateNode extends BaseNode { type: 'date', value: string }
interface CommentNode extends BaseNode { type: 'comment', value: string }
interface NameListNode extends BaseNode { type: 'nameList', kind: 'motor' | 'counter', values: string[], subtype: 'name' | 'mnemonic' }
interface ValueListNode extends BaseNode { type: 'valueList', kind: 'motor', values: number[], subtype: 'position' }
interface ScanHeadNode extends BaseNode { type: 'scanHead', index: number, code: string }
interface ScanDataNode extends BaseNode { type: 'scanData', subtype: 'serial' | 'matrix', headers: string[], data: number[][] }
interface UnknownNode extends BaseNode { type: 'unknown', kind: string, value: string }

export type ParserResult = ParserSuccess | ParserFailure | undefined;

export type ParserSuccess = {
    language: string,
    nodes: Node[],
    diagnostics: vscode.Diagnostic[],
    foldingRanges?: vscode.FoldingRange[],
    documentSymbols?: vscode.DocumentSymbol[],
};

export type ParserFailure = {
    language: string | undefined,
    nodes: undefined,
    diagnostics: vscode.Diagnostic[],
};

/**
 * Parse a text document.
 * @param document The text document to parse.
 * @param token A cancellation token.
 * @param diagnosticCollection The diagnostic collection to update.
 * @returns The result of parsing. If cancelled, return `undefined`.
 */
export function parseDocument(document: vscode.TextDocument, token: vscode.CancellationToken, diagnosticCollection: vscode.DiagnosticCollection): ParserResult {
    let parserResult: ParserResult;
    if (vscode.languages.match(SPEC_DATA_FILTER, document)) {
        parserResult = parseSpecDataContent(document.getText(), token);
    } else if (vscode.languages.match(CSV_COLUMNS_FILTER, document)) {
        parserResult = parseCsvContent(document.getText(), CSV_COLUMNS_FILTER.language, token);
    } else if (vscode.languages.match(CSV_ROWS_FILTER, document)) {
        parserResult = parseCsvContent(document.getText(), CSV_ROWS_FILTER.language, token);
    } else if (vscode.languages.match(DPPMCA_FILTER, document)) {
        parserResult = parseDppmcaContent(document.getText(), token);
    } else if (vscode.languages.match(CHIPLOT_FILTER, document)) {
        parserResult = parseChiplotContent(document.getText(), token);
    } else {
        const diagnostics = [new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 0),
            vscode.l10n.t('Unsupported language: {0}.', document.languageId),
        )];
        parserResult = { language: undefined, nodes: undefined, diagnostics };
    }

    // Update the diagnostics for the document unless parsing is cancelled.
    if (parserResult !== undefined) {
        diagnosticCollection.set(document.uri, parserResult.diagnostics);
    }

    return parserResult;
}

/**
 * Parse a text content from a URI.
 * If the URI corresponds to an opened document, parse the document. Otherwise, read the content from the file and parse it.
 * @param uri The URI to parse.
 * @return The result of parsing.
 */
export async function parseTextFromUri(uri: vscode.Uri): Promise<ParserResult> {
    let text: string;
    let language: string | undefined;

    let document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
    if (document && vscode.languages.match(DOCUMENT_SELECTOR, document)) {
        language = document.languageId;
        text = document.getText();
    } else {
        // Determine the file type (language ID) for a file.
        // First, compare the filename with a user-defined setting ("files.associations"), 
        // then with default extension patterns.
        const associations = Object.entries(
            vscode.workspace.getConfiguration('files', uri).get<Record<string, string>>('associations', {}),
        ).concat([['*.spec', 'spec-data'], ['*.mca', 'dppmca'], ['*.chi', 'chiplot']]);

        for (const [key, value] of associations) {
            if (minimatch(uri.path, key, { matchBase: true })) {
                if ((LANGUAGE_IDS as string[]).includes(value) === false) {
                    const diagnostics = [new vscode.Diagnostic(
                        new vscode.Range(0, 0, 0, 0),
                        vscode.l10n.t('Unsupported language: {0}.', value),
                    )];
                    return { language: undefined, nodes: undefined, diagnostics };
                }
                language = value;
                break;
            }
        }

        if (language === undefined) {
            const diagnostics = [new vscode.Diagnostic(
                new vscode.Range(0, 0, 0, 0),
                vscode.l10n.t('Undetermined file association.'),
            )];
            return { language: undefined, nodes: undefined, diagnostics };
        }
        // Read the content from a file.
        text = await vscode.workspace.decode(await vscode.workspace.fs.readFile(uri), { uri });
    }

    if (language === SPEC_DATA_FILTER.language) {
        return parseSpecDataContent(text);
    } else if (language === CSV_COLUMNS_FILTER.language) {
        return parseCsvContent(text, language);
    } else if (language === CSV_ROWS_FILTER.language) {
        return parseCsvContent(text, language);
    } else if (language === DPPMCA_FILTER.language) {
        return parseDppmcaContent(text);
    } else if (language === CHIPLOT_FILTER.language) {
        return parseChiplotContent(text);
    } else {
        // This case will not be hit because of the previous check.
        const diagnostics = [new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 0),
            vscode.l10n.t('Unsupported language: {0}.', language),
        )];
        return { language: undefined, nodes: undefined, diagnostics };
    }
}

function parseSpecDataContent(text: string, token?: vscode.CancellationToken): ParserResult {
    const lines = text.split(/\n|\r\n/);
    const lineCount = lines.length;
    const language = SPEC_DATA_FILTER.language;

    const nodes: Node[] = [];
    const diagnostics: vscode.Diagnostic[] = [];
    const foldingRanges: vscode.FoldingRange[] = [];
    const documentSymbols: vscode.DocumentSymbol[] = [];

    // Parameters used for making folding ranges and document symbols.
    const scanLineRegex = /^(#S [0-9]+)\s*(\S.*)?$/;
    const otherLineRegex = /^(#[a-zA-Z][0-9]*)\s(\S.*)?$/;
    let prevEmptyLineNumber = -1;

    // Parameters used for making a syntax tree for webview.
    const fileRegex = /^(#F) (.*)$/;
    const dateRegex = /^(#D) (.*)$/;
    const commentRegex = /^(#C) (.*)$/;
    const listRegex = /^(?:#([OJojP])([0-9]+)) (.*)$/;
    const scanHeadRegex = /^(#S) ([0-9]+) (.*)$/;
    const scanNumberRegex = /^(#N) ([0-9]+)$/;
    const scanDataRegex = /^(#L) (.*)$/;
    const unknownRegex = /^#(?:([a-zA-Z][0-9]*) (.*)|.*)$/;
    const emptyLineRegex = /^\s*$/;

    let prevNodeIndex = -1;
    let columnCountInHeader = -1;
    let columnCountInBody = -1;

    for (let lineNumber = 0; lineNumber < lineCount; lineNumber++) {
        if (token && token.isCancellationRequested === true) { return; }

        const line = lines[lineNumber];
        let matches: RegExpMatchArray | null;

        if (line.match(emptyLineRegex)) {
            if (lineNumber !== prevEmptyLineNumber + 1) {
                // Add a foloding range.
                foldingRanges.push(new vscode.FoldingRange(prevEmptyLineNumber + 1, lineNumber));

                // Add a document symbol (if pattern matches).
                const lineAtBlockStart = lines[prevEmptyLineNumber + 1];
                if ((matches = lineAtBlockStart.match(scanLineRegex)) || (matches = lineAtBlockStart.match(otherLineRegex))) {
                    const range = new vscode.Range(prevEmptyLineNumber + 1, 0, lineNumber, 0);
                    const selectedRange = new vscode.Range(prevEmptyLineNumber + 1, 0, prevEmptyLineNumber + 1, matches[0].length);
                    documentSymbols.push(new vscode.DocumentSymbol(matches[1], matches[2], vscode.SymbolKind.Key, range, selectedRange));
                }
            }
            prevEmptyLineNumber = lineNumber;
        } else if ((matches = line.match(fileRegex)) !== null) {
            nodes.push({ type: 'file', lineStart: lineNumber, lineEnd: lineNumber, value: matches[2] });
        } else if ((matches = line.match(dateRegex)) !== null) {
            nodes.push({ type: 'date', lineStart: lineNumber, lineEnd: lineNumber, value: matches[2] });
        } else if ((matches = line.match(commentRegex)) !== null) {
            nodes.push({ type: 'comment', lineStart: lineNumber, lineEnd: lineNumber, value: matches[2] });
        } else if ((matches = line.match(listRegex)) !== null) {
            const typeHint = matches[1] === 'P' ? {
                listType: 'valueList',
                kind: 'motor',
                subtype: 'position',
                separator: ' '
            } as const : {
                listType: 'nameList',
                kind: matches[1].toLowerCase() === 'o' ? 'motor' : 'counter',
                subtype: matches[1] === matches[1].toLowerCase() ? 'mnemonic' : 'name',
                separator: matches[1] === matches[1].toLowerCase() ? ' ' : '  '
            } as const;

            const listIndex = parseInt(matches[2]);
            const prevNode = nodes.length > 0 ? nodes[nodes.length - 1] : undefined;
            const values = matches[3].trimEnd().split(typeHint.separator);

            if (prevNode && prevNode.type === typeHint.listType && prevNode.kind === typeHint.kind && prevNode.subtype === typeHint.subtype) {
                if (prevNodeIndex !== listIndex - 1) {
                    diagnostics.push(new vscode.Diagnostic(
                        new vscode.Range(lineNumber, 0, lineNumber, 2 + matches[2].length),
                        vscode.l10n.t('Index is not consecutive.', matches[1]),
                        vscode.DiagnosticSeverity.Warning,
                    ));
                }
                if (prevNode.type === 'valueList') {
                    prevNode.values.push(...values.map(value => parseFloat(value)));
                } else {
                    prevNode.values.push(...values);
                }
                prevNode.lineEnd = lineNumber;
                prevNodeIndex = listIndex;
            } else {
                if (listIndex !== 0) {
                    diagnostics.push(new vscode.Diagnostic(
                        new vscode.Range(lineNumber, 0, lineNumber, 2 + matches[2].length),
                        vscode.l10n.t('Index is not starting with 0.'),
                        vscode.DiagnosticSeverity.Warning,
                    ));
                }
                if (typeHint.listType === 'valueList') {
                    nodes.push({ type: typeHint.listType, lineStart: lineNumber, lineEnd: lineNumber, kind: typeHint.kind, values: values.map(value => parseFloat(value)), subtype: typeHint.subtype });
                } else {
                    nodes.push({ type: typeHint.listType, lineStart: lineNumber, lineEnd: lineNumber, kind: typeHint.kind, values: values, subtype: typeHint.subtype });
                }
                prevNodeIndex = listIndex; // normally 0.
            }
        } else if ((matches = line.match(scanHeadRegex)) !== null) {
            nodes.push({ type: 'scanHead', lineStart: lineNumber, lineEnd: lineNumber, index: parseInt(matches[2]), code: matches[3] });
        } else if ((matches = line.match(scanNumberRegex)) !== null) {
            columnCountInHeader = parseInt(matches[2]);
        } else if ((matches = line.match(scanDataRegex)) !== null) {
            // The separator between motors and counters are 4 whitespaces (in old spec version only?).
            // The separator between respective motors and counters are 2 whitespaces.
            // const headers = matches[2].split('    ', 2).map(a => a.split('  ')).reduce((a, b) => a.concat(b));
            const headers = matches[2].trim().split(/ {2,}|\t/);
            if (columnCountInHeader === -1) {
                // for lazy format in which "#N" line does not exit.
                columnCountInHeader = headers.length;
            } else if (headers.length !== columnCountInHeader) {
                // In case the number of items in "#L" line is different from the value  "#N" line.
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(lineNumber, 0, lineNumber, line.length),
                    vscode.l10n.t('Column count in this line ({0}) does not match the value in the preceeding "#N" line.', headers.length),
                    vscode.DiagnosticSeverity.Warning,
                ));
            }
            const lineStart = lineNumber;

            // read succeeding lines until EOF or non-data line.
            const data0: number[][] = [];
            for (; lineNumber + 1 < lineCount; lineNumber++) {
                const blockline = lines[lineNumber + 1];
                if (blockline.match(unknownRegex) || blockline.match(emptyLineRegex)) {
                    break;
                }
                // The separator between motors and counters are 2 whitespaces.
                // The separator between respective motors and counters are 1 whitespace.
                // const rows = blockline.split('  ', 2).map(a => a.split(' ')).reduce((a, b) => a.concat(b));
                const rows = blockline.trim().split(/ {1,}|\t/);
                if (columnCountInBody === -1) {
                    // In case the first line of the scan body, compare the line number of the header part (#L).
                    // This mismatch can happen owing to spec's bug around `roisetup` and `disable` commands.
                    // So in this case, just show a message and do not stop parsing.
                    if (rows.length !== headers.length) {
                        diagnostics.push(new vscode.Diagnostic(
                            new vscode.Range(lineNumber + 1, 0, lineNumber + 1, blockline.length),
                            vscode.l10n.t('Column count in this line ({0}) does not match that in the preceeding "#L" line.', rows.length),
                            vscode.DiagnosticSeverity.Warning,
                        ));
                    }
                    columnCountInBody = rows.length;
                } else if (rows.length !== columnCountInBody) {
                    // In case the second or any later lines, compare with the first line.
                    diagnostics.push(new vscode.Diagnostic(
                        new vscode.Range(lineNumber + 1, 0, lineNumber + 1, blockline.length),
                        vscode.l10n.t('Column count in this line ({0}) does not match that of the preceeding data array.', rows.length),
                    ));
                    return { language, nodes: undefined, diagnostics };
                }
                data0.push(rows.map(item => parseFloat(item)));
            }
            // Transpose the two-dimensional data array.
            const data = data0.length > 0 ? data0[0].map((_, colIndex) => data0.map(row => row[colIndex])) : data0;

            // Add the scan data to the nodes.
            nodes.push({ type: 'scanData', subtype: 'serial', lineStart: lineStart, lineEnd: lineNumber, headers, data });
            columnCountInHeader = -1;
            columnCountInBody = -1;
        } else if ((matches = line.match(unknownRegex)) !== null) {
            nodes.push({ type: 'unknown', lineStart: lineNumber, lineEnd: lineNumber, kind: matches[1], value: matches[2] });
        }
    }
    // return nodes.length !== 0 ? nodes : undefined;
    return { language, nodes, diagnostics, foldingRanges, documentSymbols };
}

// character-separated values. The delimiter is auto-detected from a horizontal tab, a whitespace, or a comma. 
function parseCsvContent(text: string, language: CsvLanguage, token?: vscode.CancellationToken): ParserResult {
    const lines = text.split(/\r\n|\n/);
    const lineCount = lines.length;

    const nodes: Node[] = [];
    const diagnostics: vscode.Diagnostic[] = [];

    for (let lineNumber = 0; lineNumber < lineCount; lineNumber++) {
        if (token && token.isCancellationRequested === true) { return; }

        let delimRegexp: RegExp | undefined;
        let rowCount = 0;
        let headers: string[] | undefined;
        let data: number[][] = [];
        let dataStartIndex = 0;
        let isEsrfMca = false;
        // let columnCount = 0;

        // skip lines until data array.
        for (; lineNumber < lineCount; lineNumber++) {
            const line = lines[lineNumber];

            if (line.trim().length === 0) {
                // Skip an empty line.
                continue;
            } else if (line.startsWith('#')) {
                // Skip a comment line after appending the text to the nodes.
                nodes.push({ type: 'comment', lineStart: lineNumber, lineEnd: lineNumber, value: line.substring(1) });
                continue;
            } else if (language === 'csv-row' && line.startsWith('@A ')) {
                // If the line starts with "@A", it is data in ESRF's MCA format.
                // Trim the prefix: "@A ".
                isEsrfMca = true;

                // Concatenate the lines that ends with a backslash.
                let line2 = line.substring(3);
                while (line2.endsWith('\\') && lineNumber + 1 < lineCount) {
                    line2 = line2.slice(0, -1) + lines[lineNumber + 1];
                    lineNumber++;
                }
                const firstRowCells = line2.trim().split(/\s+/);
                delimRegexp = new RegExp(/\s+/);
                rowCount = firstRowCells.length;
                data.push(firstRowCells.map(cell => parseFloat(cell)));
                dataStartIndex = lineNumber;
                lineNumber++;
                break;
            } else {
                let firstCell: string;
                let delimMatch: RegExpExecArray | null;
                if ((delimMatch = /[\t, ]/.exec(line)) !== null) {
                    // If the first cell delimited by a delimiter (a tab, comma, or whitespace) is a number, go to the next step.
                    firstCell = line.slice(0, delimMatch.index);
                    if (delimMatch[0] === ' ') {
                        delimRegexp = / +/;
                    } else {
                        delimRegexp = new RegExp(delimMatch[0]);
                    }
                } else {
                    firstCell = line;
                    delimRegexp = /[\t, ]/;
                }

                if (firstCell.toLowerCase() === 'nan' || !isNaN(Number(firstCell))) {
                    const firstRowCells = line.split(delimRegexp);
                    rowCount = firstRowCells.length;
                    data.push(firstRowCells.map(cell => parseFloat(cell)));

                    // if the previous line has the same number of cells, treat it as a column header.
                    if (lineNumber > 0) {
                        const prevline = lines[lineNumber - 1];
                        const prevline2 = prevline.startsWith('#') ? prevline.substring(1).trimStart() : prevline;
                        const colLabels = prevline2.split(delimRegexp);
                        if (colLabels.length === rowCount) {
                            headers = colLabels;
                        }
                    }

                    dataStartIndex = lineNumber;
                    lineNumber++;
                    break;
                }
            }
        }

        // If no numeric cell is found, exit.
        if (data.length === 0 || !delimRegexp) {
            break;
        }

        // Read the rest of lines and append numeric cells to `data`.
        for (; lineNumber < lineCount; lineNumber++) {
            const line = lines[lineNumber];
            if (line.length === 0) {
                break;
            } else if (line.startsWith('#')) {
                lineNumber--;
                break;
            } else if (isEsrfMca) {
                lineNumber--;
                break;
            } else {
                const currentRowCells = line.split(delimRegexp);
                if (currentRowCells.length !== rowCount) {
                    diagnostics.push(new vscode.Diagnostic(
                        new vscode.Range(lineNumber, 0, lineNumber, line.length),
                        vscode.l10n.t('Column count in this line ({0}) does not match that of the preceeding data array.', currentRowCells.length),
                    ));
                    return { language, nodes: undefined, diagnostics };
                }
                data.push(currentRowCells.map(cell => parseFloat(cell)));
            }
        }

        // Add the read data to the nodes.
        if (language === 'csv-column') {
            // Transpose the two-dimensional data array.
            data = data[0].map((_, colIndex) => data.map(row => row[colIndex]));
            // Create a header if not exists.
            if (!headers) {
                headers = Array(data.length).fill(0).map((_x, i) => `column ${i}`);
            }
        } else { // language === 'csv-row'
            // Create a header.
            headers = Array(data.length).fill(0).map((_x, i) => `row ${i}`);
        }

        nodes.push({ type: 'scanData', subtype: 'matrix', lineStart: dataStartIndex, lineEnd: lineNumber - 1, headers, data });
    }

    if (nodes.some(node => node.type === 'scanData')) {
        return { language, nodes, diagnostics };
    }
}

function parseDppmcaContent(text: string, token?: vscode.CancellationToken): ParserResult {
    const lines = text.split(/\r\n|\n/);
    const lineCount = lines.length;

    const foldingRanges: vscode.FoldingRange[] = [];
    const documentSymbols: vscode.DocumentSymbol[] = [];
    const nodes: Node[] = [];
    const diagnostics: vscode.Diagnostic[] = [];
    let prevHeader: { name: string, range: vscode.Range, items: string[] } | undefined;

    const headerRegexp = /^<<([a-zA-Z0-9_ ]+)>>$/;

    for (let lineNumber = 0; lineNumber < lineCount; lineNumber++) {
        if (token && token.isCancellationRequested === true) { return; }

        const line = lines[lineNumber];

        let matches: RegExpMatchArray | null;
        if (matches = line.match(headerRegexp)) {
            if (prevHeader) {
                if (matches[1].endsWith('END')) {
                    foldingRanges.push(new vscode.FoldingRange(prevHeader.range.start.line, lineNumber));

                    const range = new vscode.Range(prevHeader.range.start, new vscode.Position(lineNumber, line.length));
                    documentSymbols.push(new vscode.DocumentSymbol(prevHeader.name, '', vscode.SymbolKind.Object, range, prevHeader.range));
                } else {
                    foldingRanges.push(new vscode.FoldingRange(prevHeader.range.start.line, lineNumber - 1));

                    const range = new vscode.Range(prevHeader.range.start, new vscode.Position(lineNumber - 1, lines[lineNumber - 1].length));
                    documentSymbols.push(new vscode.DocumentSymbol(prevHeader.name, '', vscode.SymbolKind.Object, range, prevHeader.range));
                }
                if (prevHeader.name === 'DATA') {
                    const data = [prevHeader.items.map(line => parseInt(line))];
                    nodes.push({ type: 'scanData', subtype: 'serial', lineStart: prevHeader.range.start.line, lineEnd: lineNumber, headers: ['count'], data });
                }
            }
            if (matches[1].endsWith('END')) {
                prevHeader = undefined;
            } else {
                prevHeader = { name: matches[1], range: new vscode.Range(lineNumber, 0, lineNumber, line.length), items: [] };
            }
        } else if (prevHeader) {
            prevHeader.items.push(line);
        }
    }
    return { language: DPPMCA_FILTER.language, nodes, diagnostics, foldingRanges, documentSymbols };
}

/**
 * Parse a Chiplot data file.
 * A chiplot file is made of:
 * 
 * - 1st line: title
 * - 2nd line: x-axis
 * - 3rd line: y-axis
 * - 4th line: number of point per data-set and optionally number of data-set
 * - following lines: data
 * 
 * The separator at 4th line and data rows is one or more spaces or a comma.
 * @param text Text content.
 * @param token A cancellation token.
 * @returns The result of parsing. If cancelled, return `undefined`.
 */
function parseChiplotContent(text: string, token?: vscode.CancellationToken): ParserResult {
    if (token && token.isCancellationRequested === true) { return undefined; }

    const lines = text.split(/\n|\r\n/);
    const lineCount = lines.length;
    const language = CHIPLOT_FILTER.language;

    const diagnostics: vscode.Diagnostic[] = [];

    if (lineCount < 6) {
        diagnostics.push(new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 0),
            vscode.l10n.t('Too few lines.'),
        ));
        return { language, nodes: undefined, diagnostics };
    }

    const title = lines[0].trim();
    const headers = lines[1].trim().split(/\s*,\s*|\s{2,}/).concat(lines[2].trim().split(/\s*,\s*|\s{2,}/));
    const matches = lines[3].match(/^\s*([0-9]+)((\s*,\s*|\s+)([0-9]+))?/);
    if (!matches) {
        diagnostics.push(new vscode.Diagnostic(
            new vscode.Range(3, 0, 3, lines[3].length),
            vscode.l10n.t('Data row count is not found.'),
        ));
        return { language, nodes: undefined, diagnostics };
    }
    const rowCount = parseInt(matches[1]);
    if (isNaN(rowCount) || rowCount < 1) {
        diagnostics.push(new vscode.Diagnostic(
            new vscode.Range(3, 0, 3, lines[3].length),
            vscode.l10n.t('Invalid data row count.'),
        ));
        return { language, nodes: undefined, diagnostics };
    }

    // const emptyLineRegex = /^\s*$/;
    const separatorRegex = /\s*,\s*|\s+/;

    const data: number[][] = [];
    let lineNumber;
    for (lineNumber = 4; lineNumber < lineCount; lineNumber++) {
        const line = lines[lineNumber];
        if (line.length === 0) {
            break;
        }
        const cells = line.trim().split(separatorRegex);
        data.push(cells.map(cell => parseFloat(cell)));
    }

    if (token && token.isCancellationRequested === true) { return; }

    const columnCount = data[0].length;

    const index = data.findIndex(columns => columns.length !== columnCount);
    if (index !== -1) {
        diagnostics.push(new vscode.Diagnostic(
            new vscode.Range(index + 4, 0, index + 4, lines[index + 4].length),
            vscode.l10n.t('Column count in this line ({0}) does not match that of the preceeding data array.', data[index].length),
        ));
        return { language, nodes: undefined, diagnostics };
    }
    if (data.length !== rowCount) {
        diagnostics.push(new vscode.Diagnostic(
            new vscode.Range(3, 0, 3, lines[4].length),
            vscode.l10n.t('This value does not match the row count of following data array ({0}).', data.length),
            vscode.DiagnosticSeverity.Warning,
        ));
    }

    // transpose the two-dimensional data array
    const data2 = data[0].map((_, colIndex) => data.map(row => row[colIndex]));

    // adjust the number of headers (axis labels) to that of data columns
    let headers2;
    if (headers.length < columnCount) {
        headers2 = headers;
        for (let index = headers.length; index < columnCount; index++) {
            headers2.push(`[${index.toString()}]`);
        }
    } else {
        headers2 = headers.slice(0, columnCount);
    }

    const nodes: Node[] = [];
    nodes.push({ type: 'file', lineStart: 0, lineEnd: 0, value: title });
    nodes.push({ type: 'scanData', subtype: 'serial', lineStart: 4, lineEnd: lineNumber, headers: headers2, data: data2 });

    return { language, nodes, diagnostics };
}
