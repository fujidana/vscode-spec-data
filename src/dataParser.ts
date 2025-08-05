import * as vscode from 'vscode';
import { minimatch } from 'minimatch';

export const SPEC_DATA_FILTER = { language: 'spec-data' } as const;
export const CSV_COLUMNS_FILTER = { language: 'csv-column' } as const;
export const CSV_ROWS_FILTER = { language: 'csv-row' } as const;
export const DPPMCA_FILTER = { language: 'dppmca' } as const;
export const CHIPLOT_FILTER = { language: 'chiplot' } as const;
export const DOCUMENT_SELECTOR = [SPEC_DATA_FILTER, CSV_COLUMNS_FILTER, CSV_ROWS_FILTER, DPPMCA_FILTER, CHIPLOT_FILTER] as const;
export const LANGUAGE_IDS = DOCUMENT_SELECTOR.map(filter => filter.language);
export type LanguageIds = typeof LANGUAGE_IDS[number];

export type Node = FileNode | DateNode | CommentNode | NameListNode | ValueListNode | ScanHeadNode | ScanDataNode | UnknownNode;
interface BaseNode { type: string, lineStart: number, lineEnd: number }
interface FileNode extends BaseNode { type: 'file', value: string }
interface DateNode extends BaseNode { type: 'date', value: string }
interface CommentNode extends BaseNode { type: 'comment', value: string }
interface NameListNode extends BaseNode { type: 'nameList', kind: string, values: string[], mnemonic: boolean }
interface ValueListNode extends BaseNode { type: 'valueList', kind: string, values: number[] }
interface ScanHeadNode extends BaseNode { type: 'scanHead', index: number, code: string }
interface ScanDataNode extends BaseNode { type: 'scanData', headers: string[], data: number[][], xAxisSelectable: boolean }
interface UnknownNode extends BaseNode { type: 'unknown', kind: string, value: string }

export type ParsedData = {
    language: string,
    foldingRanges?: vscode.FoldingRange[],
    documentSymbols?: vscode.DocumentSymbol[],
    nodes: Node[]
};

export function parseDocument(document: vscode.TextDocument, token: vscode.CancellationToken): ParsedData | undefined {
    if (vscode.languages.match(SPEC_DATA_FILTER, document)) {
        return parseSpecDataContent(document.getText(), token);
    } else if (vscode.languages.match(CSV_COLUMNS_FILTER, document)) {
        return parseCsvContent(document.getText(), true, token);
    } else if (vscode.languages.match(CSV_ROWS_FILTER, document)) {
        return parseCsvContent(document.getText(), false, token);
    } else if (vscode.languages.match(DPPMCA_FILTER, document)) {
        return parseDppmcaContent(document.getText(), token);
    } else if (vscode.languages.match(CHIPLOT_FILTER, document)) {
        return parseChiplotContent(document.getText(), token);
    } else {
        return undefined;
    }
}

export async function parseTextFromUri(uri: vscode.Uri): Promise<ParsedData | undefined> {
    let text: string;
    let languageId: string | undefined;

    let document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
    if (document && vscode.languages.match(DOCUMENT_SELECTOR, document)) {
        languageId = document.languageId;
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
                languageId = (LANGUAGE_IDS as string[]).includes(value) ? value : undefined;
                break;
            }
        }

        if (languageId === undefined) {
            return undefined;
        }
        // Read the content from a file.
        text = await vscode.workspace.decode(await vscode.workspace.fs.readFile(uri), { uri });
    }

    if (languageId === SPEC_DATA_FILTER.language) {
        return parseSpecDataContent(text);
    } else if (languageId === CSV_COLUMNS_FILTER.language) {
        return parseCsvContent(text, true);
    } else if (languageId === CSV_ROWS_FILTER.language) {
        return parseCsvContent(text, false);
    } else if (languageId === DPPMCA_FILTER.language) {
        return parseDppmcaContent(text);
    } else if (languageId === CHIPLOT_FILTER.language) {
        return parseChiplotContent(text);
    } else {
        return undefined;
    }
}

function parseSpecDataContent(text: string, token?: vscode.CancellationToken): ParsedData | undefined {
    const lines = text.split(/\n|\r\n/);
    const lineCount = lines.length;

    const foldingRanges: vscode.FoldingRange[] = [];
    const documentSymbols: vscode.DocumentSymbol[] = [];
    const nodes: Node[] = [];

    // Parameters used for making folding ranges and document symbols.
    const scanLineRegex = /^(#S [0-9]+)\s*(\S.*)?$/;
    const otherLineRegex = /^(#[a-zA-Z][0-9]*)\s(\S.*)?$/;
    let prevEmptyLineNumber = -1;

    // Parameters used for making a syntax tree for webview.
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
        } else if ((matches = line.match(nameListRegex)) !== null) {
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
                    vscode.window.showErrorMessage(`Inconsequent index of the name list: line ${lineNumber + 1}`);
                    return undefined;
                }
                prevNode.values.push(...(matches[3].trimEnd().split(separator)));
                prevNode.lineEnd = lineNumber;
                prevNodeIndex = listIndex;
            } else {
                if (listIndex !== 0) {
                    vscode.window.showErrorMessage(`The name list not starding with 0: line ${lineNumber + 1}`);
                    return undefined;
                }
                nodes.push({ type: 'nameList', lineStart: lineNumber, lineEnd: lineNumber, kind: kind, values: matches[3].trimEnd().split(separator), mnemonic: isMnemonic });
                prevNodeIndex = 0;
            }
        } else if ((matches = line.match(valueListRegex)) !== null) {
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
                    vscode.window.showErrorMessage(`Inconsequent index of the value list: line ${lineNumber + 1}`);
                    return undefined;
                }
                prevNode.values.push(...(matches[3].trimEnd().split(' ').map(value => parseFloat(value))));
                prevNode.lineEnd = lineNumber;
                prevNodeIndex = listIndex;
            } else {
                if (listIndex !== 0) {
                    vscode.window.showErrorMessage(`The value list not starding with 0: line ${lineNumber + 1}`);
                    return undefined;
                }
                nodes.push({ type: 'valueList', lineStart: lineNumber, lineEnd: lineNumber, kind: kind, values: matches[3].trimEnd().split(' ').map(value => parseFloat(value)) });
                prevNodeIndex = 0;
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
                vscode.window.showErrorMessage(`mismatch in the number of columns. (line ${lineNumber + 1}). #N: ${columnCountInHeader}, #L: ${headers.length}`);
                return undefined;
            }
            const lineStart = lineNumber;

            // read succeeding lines until EOF or non-data line.
            const data: number[][] = [];
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
                    // In case the first line of the scan body, compare the line number of the header part.
                    // This mismatch can happen owing to spec's bug around `roisetup` and `disable` commands.
                    // So in this case, just show a message and do not stop parsing.
                    if (rows.length !== columnCountInHeader) {
                        vscode.window.showWarningMessage(`mismatch in the number of columns (line ${lineNumber + 2}). header: ${columnCountInHeader}), body: ${rows.length}.`);
                    }
                    columnCountInBody = rows.length;
                } else if (rows.length !== columnCountInBody) {
                    // In case the second or any later lines, compare with the first line.
                    vscode.window.showErrorMessage(`mismatch in the number of columns (line ${lineNumber + 2}). expected: ${columnCountInBody},  ${rows.length}.`);
                    return undefined;
                }
                data.push(rows.map(item => parseFloat(item)));
            }
            // transpose the two-dimensional data array
            const data2 = data.length > 0 ? data[0].map((_, colIndex) => data.map(row => row[colIndex])) : data;

            nodes.push({ type: 'scanData', lineStart: lineStart, lineEnd: lineNumber, headers: headers, data: data2, xAxisSelectable: true });
            columnCountInHeader = -1;
            columnCountInBody = -1;
        } else if ((matches = line.match(unknownRegex)) !== null) {
            nodes.push({ type: 'unknown', lineStart: lineNumber, lineEnd: lineNumber, kind: matches[1], value: matches[2] });
        }
    }
    // return nodes.length !== 0 ? nodes : undefined;
    return { language: SPEC_DATA_FILTER.language, foldingRanges, documentSymbols, nodes };
}

// character-separated values. The delimiter is auto-detected from a horizontal tab, a whitespace, or a comma. 
function parseCsvContent(text: string, columnWise: boolean, token?: vscode.CancellationToken): ParsedData | undefined {
    const lines = text.split(/\r\n|\n/);
    const lineCount = lines.length;

    const nodes: Node[] = [];

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
            } else if (!columnWise && line.startsWith('@A ')) {
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
        nodes.push({ type: 'scanData', lineStart: dataStartIndex, lineEnd: lineNumber - 1, headers: headers, data: data, xAxisSelectable: columnWise });
    }

    const language = columnWise ? CSV_COLUMNS_FILTER.language : CSV_ROWS_FILTER.language;
    if (nodes.some(node => node.type === 'scanData')) {
        return { language, nodes };
    }
}

function parseDppmcaContent(text: string, token?: vscode.CancellationToken): ParsedData | undefined {
    const lines = text.split(/\r\n|\n/);
    const lineCount = lines.length;

    const foldingRanges: vscode.FoldingRange[] = [];
    const documentSymbols: vscode.DocumentSymbol[] = [];
    const nodes: Node[] = [];
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
                    const data1d = prevHeader.items.map(line => parseInt(line));
                    nodes.push({ type: 'scanData', lineStart: prevHeader.range.start.line, lineEnd: lineNumber, headers: ['count'], data: [data1d], xAxisSelectable: false });
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
    return { language: DPPMCA_FILTER.language, foldingRanges, documentSymbols, nodes };
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
 * @param token Cancellation token.
 * @returns Parsed Data.
 */
function parseChiplotContent(text: string, token?: vscode.CancellationToken): ParsedData | undefined {
    if (token && token.isCancellationRequested === true) { return; }

    const lines = text.split(/\n|\r\n/);
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
    const rowCount = parseInt(matches[1]);
    if (isNaN(rowCount) || rowCount < 1) {
        return undefined;
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

    if (data.length !== rowCount) {
        // row number mismatch with the header (4th line).
        return undefined;
    } else if (data.some(columns => columns.length !== columnCount)) {
        // column number not equal with the first data row (5th line)
        return undefined;
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
    nodes.push({ type: 'scanData', lineStart: 4, lineEnd: lineNumber, headers: headers2, data: data2, xAxisSelectable: true });

    return { language: CHIPLOT_FILTER.language, nodes };
}
