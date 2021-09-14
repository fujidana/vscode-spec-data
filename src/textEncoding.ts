import * as vscode from 'vscode';

/**
 * TextDecoder object.
 * 
 * While in web browsers this is a global object, in Node.js this is 
 * in the 'util' module. 
 * Though the Node.js documentataion says the object is now globally available
 *  (since 11.0.0),
 * https://nodejs.org/api/util.html#util_new_textdecoder_encoding_options
 * "@types/node" provides the type definition only in 'util' module.
 * To make this extension web-ready, stop using
 * `import { TextDecoder } from 'util'`
 * and instead refer to a global object.
 */
declare class TextDecoder {
    readonly encoding: string;
    readonly fatal: boolean;
    readonly ignoreBOM: boolean;
    constructor(
        encoding?: string,
        options?: { fatal?: boolean | undefined; ignoreBOM?: boolean | undefined }
    );
    decode(
        input?: NodeJS.ArrayBufferView | ArrayBuffer | null,
        options?: { stream?: boolean | undefined }
    ): string;
}

/**
 * Conversion table from VS Code's "files.encoding" values to TextDecoder's encoding parameters.
 * The table was prrepared for encodings available in VS Code v1.58.0.
 */
const ENCODING_DICTIONARY: Record<string, string | undefined> = {
    utf8: 'utf-8', // UTF-8
    utf8bom: 'utf-8',
    utf16le: 'utf-16le', // UTF-16 LE
    utf16be: 'utf-16be', // UTF-16 BE
    windows1252: 'windows-1252', // Western (Windows 1252)
    iso88591: 'iso-8859-1', // Western (ISO 8859-1), alias of 'windows-1252'?
    iso88593: 'iso-8859-3', // Western (ISO 8859-3)
    iso885915: 'iso-8859-15', // Western (ISO 8859-15)
    macroman: 'macintosh', // Western (Mac Roman)
    cp437: undefined, // DOS (CP 437)
    windows1256: 'windows-1256', // Arabic (Windows 1256)
    iso88596: 'iso-8859-6', // Arabic (ISO 8859-6)
    windows1257: 'windows-1257', // Baltic (Windows 1257)
    iso88594: 'iso-8859-4', // Baltic (ISO 8859-4)
    iso885914: 'iso-8859-14', // Celtic (ISO 8859-14)
    windows1250: 'windows-1250', // Central European (Windows 1250)
    iso88592: 'iso-8859-2', // Central European (ISO 8859-2)
    cp852: undefined, // Central European (CP 852)
    windows1251: 'windows-1251', // Cyrillic (Windows 1251)
    cp866: 'ibm866', // Cyrillic (CP 866)
    iso88595: 'iso-8859-5', // Cyrillic (ISO 8859-5)
    koi8r: 'koi8-r', // Cyrillic (KOI8-R)
    koi8u: 'koi8-up', // Cyrillic (KOI8-U)
    iso885913: 'iso-8859-13', // Estonian (ISO 8859-13)
    windows1253: 'windows-1253', // Greek (Windows 1253)
    iso88597: 'iso-8859-7', // Greek (ISO 8859-7)
    windows1255: 'windows-1255', // Hebrew (Windows 1255)
    iso88598: 'iso-8859-8', // Hebrew (ISO 8859-8)
    iso885910: 'iso-8859-10', // Nordic (ISO 8859-10)
    iso885916: 'iso-8859-16', // Romanian (ISO 8859-16)
    windows1254: 'windows-1254', // Turkish (Windows 1254)
    iso88599: 'iso-8859-9', // Turkish (ISO 8859-9)
    windows1258: 'windows-1258', // Vietnamese (Windows 1258)
    gbk: 'gbk', // Simplified Chinese (GBK)
    gb18030: 'gb18030', // Simplified Chinese (GB18030)
    cp950: 'big5', // Traditional Chinese (Big5)
    big5hkscs: 'big5-hkscs', // Traditional Chinese (Big5-HKSCS), alias of 'big5'?
    shiftjis: 'shift-jis', // Japanese (Shift JIS)
    eucjp: 'euc-jp', // Japanese (EUC-JP)
    euckr: 'euc-kr',// Korean (EUC-KR)
    windows874: 'windows-874', // Thai (Windows 874)
    iso885911: 'iso-8859-11', // Latin/Thai (ISO 8859-11), alias of ''windows-874'?
    koi8ru: 'koi8-ru', // Cyrillic (KOI8-RU)
    koi8t: undefined, // Tajik (KOI8-T)
    gb2312: 'gb2312', // Simplified Chinese (GB 2312), alias of 'gbk'?
    cp865: undefined, // Nordic DOS (CP 865)
    cp850: undefined, // Western European DOS (CP 850)
};

/**
 * @param scope configuration scope. To include language-specific settings in searching paths of the configurations, provide a `{ uri?: vscode.Uri | undefined, languageId: string }` object.
 * @returns TextDecoder object
 * 
 * Create a TextDecoder object, referring to a text encoding defined in the configuration property 'files.encoding'.
 * Since the encoding string in VS Code and TextDecoder are not identical, the property value is converted internally.
 * Currently the convertion table lacks the TextDecoder's encodings corresponding to VS Code's `cp437`, `cp852`, `koi8t`, `cp865`, and `cp850`; for them `utf8` is used instead.
 */
export function getTextDecoder(scope?: vscode.ConfigurationScope): TextDecoder {
    // get 'files.encoding' property value
    const vscodeEncoding = vscode.workspace.getConfiguration('files', scope).get<string>('encoding');
    const textDecoderEncoding = vscodeEncoding && vscodeEncoding in ENCODING_DICTIONARY ? ENCODING_DICTIONARY[vscodeEncoding] : undefined;

    // If encoding is undefined, TextDecoder uses UTF-8 as its encoding.
    return new TextDecoder(textDecoderEncoding);
}
