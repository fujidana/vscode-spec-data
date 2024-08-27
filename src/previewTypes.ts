export interface ValueListState { [occurance: number]: { hidden: boolean } }
export interface ScanDataState { [occurance: number]: { x: number, y: number[], hidden: boolean, logAxis: boolean } }

export interface State {
    template: unknown,
    valueList: ValueListState,
    scanData: ScanDataState,
    sourceUri: string,
    lockPreview: boolean
}

export type MessageToWebview =
    LockPreviewMessage
    | ScrollToElementMessage
    | SetTemplateMessage
    | UpdatePlotMessage;

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
    action: ActionType;
}

interface UpdatePlotMessage extends BaseMessage {
    type: 'updatePlot';
    elementId: string;
    x: { label: string, array: number[] };
    y: { label: string, array: number[] }[];
    logAxis: boolean;
    action: ActionType;
}

export type MessageFromWebview =
    requestPlotDataMessage
    | ContentLoadedMessage;

interface requestPlotDataMessage extends BaseMessage {
    type: 'requestPlotData';
    occurance: number;
    indexes: {
        x: number,
        y: number[]
    };
    logAxis: boolean;
    action: ActionType;
}

interface ContentLoadedMessage extends BaseMessage {
    type: 'contentLoaded';
}

export type ActionType = 'new' | 'update' | 'react';