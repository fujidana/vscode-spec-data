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
    enableRightAxis: boolean;
    scrollY: number;
}

export interface BaseMessage {
    type: string;
}

export type CallbackType = 'newPlot' | 'relayout' | 'react';

export type MessageToWebview =
    LockPreviewMessage
    | ScrollPreviewMessage
    | SetTemplateMessage
    | UpdatePlotMessage
    | EnableMultipleSelectionMessage
    | EnableRightAxisMessage
    | SetScrollBehaviorMessage;

interface LockPreviewMessage extends BaseMessage {
    type: 'lockPreview';
    flag: boolean;
}

interface ScrollPreviewMessage extends BaseMessage {
    type: 'scrollPreview';
    elementId: string;
}

interface SetTemplateMessage extends BaseMessage {
    type: 'setTemplate';
    template: unknown;
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

interface EnableRightAxisMessage extends BaseMessage {
    type: 'enableRightAxis';
    flag: boolean;
}

interface SetScrollBehaviorMessage extends BaseMessage {
    type: 'setScrollBehavior';
    value: 'auto' | 'smooth';
}

export type MessageFromWebview =
    ScrollEditorMessage
    | requestPlotDataMessage
    | ContentLoadedMessage;

interface ScrollEditorMessage extends BaseMessage {
    type: 'scrollEditor';
    line: number;
}

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
