// @types/plotly.js contains DOM objects and thus
// `tsc -p .` fails without `skipLibCheck`.
import type { Template } from 'plotly.js';
// type Template = any;

type GraphMode = 'line' | 'heatmap';

export interface GraphParam {
    mode: GraphMode;
    hidden: boolean;
    selections?: {
        x: number;
        y1: number[];
        y2: number[];
    };
    y1Log?: boolean;
    y2Log?: boolean;
}

export interface State {
    fresh: boolean;
    template: Template | undefined;
    tableParams: { hidden: boolean }[];
    graphParams: GraphParam[];
    sourceUri: string;
    lockPreview: boolean;
    enableMultipleSelection: boolean;
    enableRightAxis: boolean;
    scrollPosition: [number, number];
}

export interface BaseMessage {
    type: string;
}

export type CallbackType = 'newPlot' | 'relayout' | 'react';

export type MessageToWebview =
    | LockPreviewMessage
    | ScrollPreviewMessage
    | SetTemplateMessage
    | UpdateLinePlotMessage
    | UpdateHeatmapMessage
    | EnableMultipleSelectionMessage
    | EnableRightAxisMessage
    | EnableEditorScrollMessage
    | SetScrollBehaviorMessage
    | RestoreScrollMessage;

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
    template: Template;
    callback: CallbackType;
}

interface UpdateLinePlotMessage extends BaseMessage {
    type: 'updateLinePlot';
    graphNumber: number;
    x: { label: string, array: number[] };
    y1: { label: string, array: number[] }[];
    y2: { label: string, array: number[] }[];
    action: CallbackType;
}

interface UpdateHeatmapMessage extends BaseMessage {
    type: 'updateHeatmap';
    graphNumber: number;
    z: number[][];
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

interface EnableEditorScrollMessage extends BaseMessage {
    type: 'enableEditorScroll';
    flag: boolean;
}

interface SetScrollBehaviorMessage extends BaseMessage {
    type: 'setScrollBehavior';
    value: 'auto' | 'smooth';
}

interface RestoreScrollMessage extends BaseMessage {
    type: 'restoreScroll';
    delay: boolean;
}

export type MessageFromWebview =
    | ScrollEditorMessage
    | requestLineDataMessage
    | requestHeatmapDataMessage
    | ContentLoadedMessage;

interface ScrollEditorMessage extends BaseMessage {
    type: 'scrollEditor';
    line: number;
}

interface requestLineDataMessage extends BaseMessage {
    type: 'requestLineData';
    graphNumber: number;
    selections: {
        x: number;
        y1: number[];
        y2: number[];
    };
    callback: CallbackType;
}

interface requestHeatmapDataMessage extends BaseMessage {
    type: 'requestHeatmapData';
    graphNumber: number;
    callback: CallbackType;
}

interface ContentLoadedMessage extends BaseMessage {
    type: 'contentLoaded';
}
