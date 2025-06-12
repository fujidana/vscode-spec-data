import * as vscode from 'vscode';

const SPEC_DATA_FILTER = { language: 'spec-data' };
const CSV_COLUMNS_FILTER = { language: 'csv-column' };
const CSV_ROWS_FILTER = { language: 'csv-row' };
const DPPMCA_FILTER = { language: 'dppmca' };
const CHIPLOT_FILTER = { language: 'chiplot' };
const DOCUMENT_SELECTOR = [SPEC_DATA_FILTER, CSV_COLUMNS_FILTER, CSV_ROWS_FILTER, DPPMCA_FILTER, CHIPLOT_FILTER];

const DPPMCA_BLOCK_REGEXP = /^<<([a-zA-Z0-9_ ]+)>>$/;

export type ParsedData = {
    foldingRanges: vscode.FoldingRange[],
    documentSymbols: vscode.DocumentSymbol[],
    // documentLinks: vscode.DocumentLink[],
};

export async function parseDocument(document: vscode.TextDocument): Promise<ParsedData> {
    const foldingRanges: vscode.FoldingRange[] = [];
    const documentSymbols: vscode.DocumentSymbol[] = [];

    if (vscode.languages.match(SPEC_DATA_FILTER, document)) {
        const lineCount = document.lineCount;
        let prevLineIndex = -1;

        const scanLineRegex = /^(#S [0-9]+)\s*(\S.*)?$/;
        const otherLineRegex = /^(#[a-zA-Z][0-9]*)\s(\S.*)?$/;

        for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
            if (document.lineAt(lineIndex).isEmptyOrWhitespace) {
                if (lineIndex !== prevLineIndex + 1) {
                    foldingRanges.push(new vscode.FoldingRange(prevLineIndex + 1, lineIndex));

                    const lineTextAtBlockStart = document.lineAt(prevLineIndex + 1).text;
                    let matches: RegExpMatchArray | null;
                    if ((matches = lineTextAtBlockStart.match(scanLineRegex)) || (matches = lineTextAtBlockStart.match(otherLineRegex))) {
                        const range = new vscode.Range(prevLineIndex + 1, 0, lineIndex, 0);
                        const selectedRange = new vscode.Range(prevLineIndex + 1, 0, prevLineIndex + 1, matches[0].length);
                        documentSymbols.push(new vscode.DocumentSymbol(matches[1], matches[2], vscode.SymbolKind.Key, range, selectedRange));
                    }
                }
                prevLineIndex = lineIndex;
            }
        }
    } else if (vscode.languages.match(DPPMCA_FILTER, document)) {
        const lineCount = document.lineCount;
        let prevHeader: { name: string, range: vscode.Range } | undefined;

        for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
            const line = document.lineAt(lineIndex);

            let matches: RegExpMatchArray | null;
            if (matches = line.text.match(DPPMCA_BLOCK_REGEXP)) {
                if (matches[1].endsWith('END')) {
                    if (prevHeader) {
                        foldingRanges.push(new vscode.FoldingRange(prevHeader.range.start.line, lineIndex));

                        const range = new vscode.Range(prevHeader.range.start, line.range.end);
                        documentSymbols.push(new vscode.DocumentSymbol(prevHeader.name, '', vscode.SymbolKind.Object, range, prevHeader.range));
                    }
                    prevHeader = undefined;
                } else {
                    if (prevHeader) {
                        foldingRanges.push(new vscode.FoldingRange(prevHeader.range.start.line, lineIndex - 1));

                        const range = new vscode.Range(prevHeader.range.start, document.lineAt(lineIndex - 1).range.end);
                        documentSymbols.push(new vscode.DocumentSymbol(prevHeader.name, '', vscode.SymbolKind.Object, range, prevHeader.range));
                    }
                    prevHeader = { name: matches[1], range: line.range };
                }
            }
        }
    }
    return { foldingRanges, documentSymbols };
}
