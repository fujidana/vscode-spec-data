// @types/plotly.js contains DOM objects and thus
// `tsc -p .` fails without `skipLibCheck`.
import type { Template } from 'plotly.js';
// type Template = any;

export type GraphMode = 'line-xy' | 'line-y' | 'heatmap-serial' | 'heatmap-matrix' | 'contour-serial' | 'contour-matrix';

interface TableState {
    hidden: boolean;
}

export interface GraphState {
    mode: GraphMode;
    hidden: boolean;
    selections: [
        number | number[],
        number | number[],
        number | number[],
    ];
    logs: [boolean, boolean, boolean];
}

export interface State {
    template: Template | undefined;
    tableStates: TableState[];
    graphStates: GraphState[];
    sourceUri: string;
    lockPreview: boolean;
    enableMultipleSelection: boolean;
    enableRightAxis: boolean;
    scrollPosition: [number, number];
}

interface BaseMessage {
    type: string;
}

// type CallbackType = 'newPlot' | 'relayout' | 'react';

export type MessageToWebview =
    | LockPreviewMessage
    | ScrollPreviewMessage
    | SetTemplateMessage
    | UpdateLinePlotMessage
    | UpdateHeatmapMessage
    | UpdateContourPlotSerialMessage
    | UpdateContourPlotMatrixMessage
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
    callback: 'newPlot' | 'relayout';
}

interface BaseUpdatePlotMessage extends BaseMessage {
    type: 'updatePlot';
    plotType: 'line' | 'heatmap' | 'contour';
    graphNumber: number;
    action: 'newPlot' | 'react';
}

interface BaseUpdatePlotMatrixMessage extends BaseUpdatePlotMessage {
    dataType: 'matrix';
    plotType: 'heatmap' | 'contour';
    transposed?: boolean;
    x?: { label: string, start: number, delta: number };
    y?: { label: string, start: number, delta: number };
    z: { label?: string, array: (number | null)[][] };
}

interface UpdateLinePlotMessage extends BaseUpdatePlotMessage {
    plotType: 'line';
    x?: { label: string, array: (number | null)[] };
    y1: { label: string, array: (number | null)[] }[];
    y2: { label: string, array: (number | null)[] }[];
}

interface UpdateHeatmapMessage extends BaseUpdatePlotMatrixMessage {
    plotType: 'heatmap';
}

interface UpdateContourPlotSerialMessage extends BaseUpdatePlotMessage {
    plotType: 'contour';
    dataType: 'serial';
    x: { label: string, array: (number | null)[] };
    y: { label: string, array: (number | null)[] };
    z: { label?: string, array: (number | null)[] };
}

interface UpdateContourPlotMatrixMessage extends BaseUpdatePlotMatrixMessage {
    plotType: 'contour';
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
    | RequestLineDataMessage
    | RequestHeatmapSerialDataMessage
    | RequestHeatmapMatrixDataMessage
    | RequestContourSerialDataMessage
    | RequestContourMatrixDataMessage
    | ContentLoadedMessage;

interface ScrollEditorMessage extends BaseMessage {
    type: 'scrollEditor';
    line: number;
}

interface BaseRequestDataMessage extends BaseMessage {
    type: 'requestData';
    plotType: 'line' | 'heatmap' | 'contour';
    graphNumber: number;
    callback: 'newPlot' | 'react';
}

interface RequestLineDataMessage extends BaseRequestDataMessage {
    plotType: 'line';
    selections: {
        x: number;
        y1: number[];
        y2: number[];
    };
}

interface RequestHeatmapSerialDataMessage extends BaseRequestDataMessage {
    plotType: 'heatmap';
    dataType: 'serial';
    selection: number;
}

interface RequestHeatmapMatrixDataMessage extends BaseRequestDataMessage {
    plotType: 'heatmap';
    dataType: 'matrix';
}

interface RequestContourSerialDataMessage extends BaseRequestDataMessage {
    plotType: 'contour';
    dataType: 'serial';
    selections: {
        x: number;
        y: number;
        z: number;
    }
}

interface RequestContourMatrixDataMessage extends BaseRequestDataMessage {
    plotType: 'contour';
    dataType: 'matrix';
}

interface ContentLoadedMessage extends BaseMessage {
    type: 'contentLoaded';
}
