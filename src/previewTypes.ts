export interface ValueListState { [occurance: number]: { hidden: boolean } }
export interface ScanDataState { [occurance: number]: { x: number, y1: number[], y2: number[], hidden: boolean, logAxis: boolean } }

export interface State {
    template: unknown,
    valueList: ValueListState,
    scanData: ScanDataState,
    sourceUri: string,
    lockPreview: boolean,
    enableMultipleSelection: boolean
}

export type MessageToWebview =
    LockPreviewMessage
    | ScrollToElementMessage
    | SetTemplateMessage
    | UpdatePlotMessage
    | EnableMultipleSelectionMessage;

export interface BaseMessage {
    type: string;
}

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
    logAxis: boolean;
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
    logAxis: boolean;
    callback: CallbackType;
}

interface ContentLoadedMessage extends BaseMessage {
    type: 'contentLoaded';
}

export type CallbackType = 'newPlot' | 'relayout' | 'react';