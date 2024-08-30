export interface ScanDataState {
    xIndex: number;
    y1Indexes: number[];
    y2Indexes: number[];
    hidden: boolean;
    y1Log: boolean;
    y2Log: boolean;
}

export interface State {
    template: unknown;
    valueList: { [occurance: number]: { hidden: boolean } };
    scanData: { [occurance: number]: Partial<ScanDataState> };
    sourceUri: string;
    lockPreview: boolean;
    enableMultipleSelection: boolean;
    scrollY: number;
}

export interface BaseMessage {
    type: string;
}

export type MessageToWebview =
    LockPreviewMessage
    | ScrollToElementMessage
    | SetTemplateMessage
    | UpdatePlotMessage
    | EnableMultipleSelectionMessage;

interface LockPreviewMessage extends BaseMessage {
    type: 'lockPreview';
    flag: boolean;
}

interface ScrollToElementMessage extends BaseMessage {
    type: 'scrollToElement';
    elementId: string;
}

interface SetTemplateMessage extends BaseMessage {
    type: 'setTemplate';
    template: any; // TODOS: type definition
    callback: CallbackType;
}

interface UpdatePlotMessage extends BaseMessage {
    type: 'updatePlot';
    occurance: number;
    x: { label: string, array: number[] };
    y1: { label: string, array: number[] }[];
    y2: { label: string, array: number[] }[];
    action: CallbackType;
}

interface EnableMultipleSelectionMessage extends BaseMessage {
    type: 'enableMultipleSelection';
    flag: boolean;
}

export type MessageFromWebview =
    requestPlotDataMessage
    | ContentLoadedMessage;

interface requestPlotDataMessage extends BaseMessage {
    type: 'requestPlotData';
    occurance: number;
    indexes: {
        x: number,
        y1: number[],
        y2: number[]
    };
    callback: CallbackType;
}

interface ContentLoadedMessage extends BaseMessage {
    type: 'contentLoaded';
}

export type CallbackType = 'newPlot' | 'relayout' | 'react';