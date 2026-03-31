/*
 * A JavaScript transpiled from this file is loaded by <script src="..."> in
 * a webview HTML file.
 */

/*
 * At run-time, Plotly is separately loaded by `<script src=""...">` in the
 * HTML file and thus, is available in the global scope.
 */
// import Plotly from 'plotly.js';
declare const Plotly: any;

import type { MessageFromWebview, MessageToWebview, State, GraphState } from './previewTypes';

const vscode = acquireVsCodeApi<State>();

const headDataset = document.head.dataset;
const plotHeight = parseInt(headDataset.plotHeight ?? '100');

let state = vscode.getState();
if (state === undefined) {
    state = {
        template: undefined,
        tableStates: [],
        graphStates: [],
        sourceUri: headDataset.sourceUri ?? '',
        lockPreview: false,
        enableMultipleSelection: Boolean(parseInt(headDataset.enableMultipleSelection ?? '0')),
        enableRightAxis: Boolean(parseInt(headDataset.enableRightAxis ?? '0')),
        scrollPosition: [0, 0],
    };
    vscode.setState(state);
} else if (state.sourceUri !== headDataset.sourceUri) {
    state.tableStates = [];
    state.graphStates = [];
    state.sourceUri = headDataset.sourceUri ?? '';
    state.scrollPosition = [0, 0];
    vscode.setState(state);
}

let scrollsEditor = false;
let lastScrollEditorTimeStamp = 0;
let lastScrollPreviewTimeStamp = 0;

let timer1: NodeJS.Timeout | undefined;
let timer2: NodeJS.Timeout | undefined;

/**
 * Called when the preview content is loaded or `enableMultipleSelection` message is received.
 * This updates the `multiple` attribute of data selection dropdowns according to the state.
 * Note that the `mode` property of the graph state (not the value of the
 * corresponding HTML element) is also referred.
 */
const updateForEnableMultipleSelection = function (index: number, scanDataDiv: HTMLDivElement, updateSelection: boolean) {
    const dataSelects = scanDataDiv.getElementsByClassName('dataSelect') as HTMLCollectionOf<HTMLSelectElement>;

    if (dataSelects.length !== 3 || state.graphStates.length <= index) { return; }

    const graphState = state.graphStates[index];

    if (graphState.mode === 'line-y' || graphState.mode === 'line-xy') {
        if (state.enableMultipleSelection === true) {
            [...dataSelects].forEach((select, j) => {
                // Set 'size' attributes for all axes, which makes the dropdown lists become list boxes.
                select.size = Math.min(4, select.options.length);

                if (j === 1 || j === 2) { // y1- or y2-axis
                    // Set 'multiple' attributes and hide '[none]' option for y1- and y2-axis.
                    // Unselect all options if '[none]' was previously selected.
                    const noneOption = select.options[select.options.length - 1];
                    select.multiple = true;
                    if (j === 2) { // y2-axis
                        noneOption.hidden = true;
                    }
                    if (updateSelection && noneOption.selected) {
                        noneOption.selected = false;
                        select.selectedIndex = -1;
                    }
                }
                if (updateSelection) {
                    graphState.selections[j] = [...select.selectedOptions].map(option => option.index);
                }
            });
        } else {
            // Clear 'size' attributes for all axes, which makes the list boxes become dropdown lists.
            [...dataSelects].forEach((select, j) => {
                select.size = 0;
                // select.removeAttribute('size');

                if (j === 1 || j === 2) { // y1- or y2-axis
                    const noneOption = select.options[select.options.length - 1];
                    if (updateSelection && select.selectedIndex === -1) {
                        noneOption.selected = true;
                    }
                    select.multiple = false;
                    // select.removeAttribute('multiple');

                    if (j === 2) { // y2-axis
                        noneOption.hidden = false;
                    }
                }
                if (updateSelection) {
                    graphState.selections[j] = select.selectedIndex;
                }
            });
        }
    } else if (graphState.mode === 'heatmap-serial' || graphState.mode === 'heatmap-matrix' || graphState.mode === 'contour-serial' || graphState.mode === 'contour-matrix') {
        // Multiple selection is not allowed for heatmap and contour plots.
        [...dataSelects].forEach((select, j) => {
            select.size = 0;
            select.multiple = false;
            if (updateSelection) {
                graphState.selections[j] = select.selectedIndex;
            }
        });
    }
};

/**
 * Called when the preview content is loaded or the 'Show Plot' checkbox is toggled.
 * This shows or hides the plot and enables or disables (gray-out) related input
 * elements according to the graph state.
 * Note that the `hidden` property of the graph state (not the value of the
 * corresponding HTML element) is referred.
*/
const updateForShowPlotInput = function (index: number, scanDataDiv: HTMLDivElement) {
    const modeSelects = scanDataDiv.getElementsByClassName('modeSelect') as HTMLCollectionOf<HTMLSelectElement>;
    const dataSelects = scanDataDiv.getElementsByClassName('dataSelect') as HTMLCollectionOf<HTMLSelectElement>;
    const logInputs = scanDataDiv.getElementsByClassName('logInput') as HTMLCollectionOf<HTMLInputElement>;

    if (modeSelects.length !== 1 || dataSelects.length !== 3 || logInputs.length !== 3) { return; }

    [...modeSelects, ...dataSelects, ...logInputs].forEach(element => element.disabled = state.graphStates[index].hidden);
};

/**
 * Called when the preview content is loaded or the plot mode (line or heatmap) is changed.
 * This updates the visibility and labels of related input elements according to the state.
 * Note that the `mode` property of the graph state (not the value of the
 * corresponding HTML element) is referred.
 * `updateForEnableMultipleSelection()` must be called after this function to
 * update the `multiple` attribute of data selection dropdowns according to the state.
 */
const updateForModeSelect = function (index: number, scanDataDiv: HTMLDivElement, updateSelection: boolean) {
    const axisSpans = scanDataDiv.getElementsByClassName('axisSpan') as HTMLCollectionOf<HTMLSpanElement>;
    const dataSelects = scanDataDiv.getElementsByClassName('dataSelect') as HTMLCollectionOf<HTMLSelectElement>;
    const dataAxisNameSpans = scanDataDiv.getElementsByClassName('dataAxisNameSpan') as HTMLCollectionOf<HTMLSpanElement>;
    const logSpans = scanDataDiv.getElementsByClassName('logSpan') as HTMLCollectionOf<HTMLSpanElement>;

    if ([axisSpans, dataSelects, dataAxisNameSpans, logSpans].some(element => element.length !== 3) || state.graphStates.length <= index) { return; }

    const graphState = state.graphStates[index];

    if (graphState.mode === 'line-y' || graphState.mode === 'line-xy') {
        const hideAxes = [false, false, !state.enableRightAxis];
        const axisNameHTMLs = ['<var>x</var>', '<var>y</var>', '<var>y</var><sub>2</sub>'];
        const extraLabels = ['[point]', '[none]', '[none]'];
        const hideExtraOptions = [false, true, false];
        const hideLogSpans = [true, false, false];
        const selections = [
            dataSelects[0].length <= 2 || graphState.mode === 'line-y' ? dataSelects[0].length - 1 : 0,
            dataSelects[1].length - 2,
            dataSelects[2].length - 1
        ];
        for (let j = 0; j < 3; j++) {
            const options = dataSelects[j].options;
            axisSpans[j].hidden = hideAxes[j];
            dataAxisNameSpans[j].innerHTML = axisNameHTMLs[j];
            options[options.length - 1].label = extraLabels[j];
            options[options.length - 1].hidden = hideExtraOptions[j];
            logSpans[j].hidden = hideLogSpans[j];
            if (updateSelection) {
                dataSelects[j].selectedIndex = selections[j];
                graphState.selections[j] = selections[j];
            }
        }
    } else if (graphState.mode === 'heatmap-serial' || graphState.mode === 'heatmap-matrix' || graphState.mode === 'contour-serial' || graphState.mode === 'contour-matrix') {
        const hideXYAxes = graphState.mode !== 'contour-serial'; // graphState.mode === 'heatmap-serial' || graphState.mode === 'heatmap-matrix' || graphState.mode === 'contour-matrix';
        const hideZAxis = graphState.mode === 'heatmap-matrix' || graphState.mode === 'contour-matrix';

        const hideAxes = [hideXYAxes, hideXYAxes, hideZAxis];
        const axisNames = ['x', 'y', 'z'];
        const extraLabels = ['[point]', '[point]', '[none]'];
        // const hideExtraOptions = [true, true, true];
        // const hideLogSpans = [true, true, true];
        const selections = [0, 1, dataSelects[2].length - 2];
        for (let j = 0; j < 3; j++) {
            const options = dataSelects[j].options;
            axisSpans[j].hidden = hideAxes[j];
            dataAxisNameSpans[j].innerHTML = `<var>${axisNames[j]}</var>`;
            options[options.length - 1].label = extraLabels[j];
            options[options.length - 1].hidden = true;
            logSpans[j].hidden = true;
            if (updateSelection) {
                dataSelects[j].selectedIndex = selections[j];
                graphState.selections[j] = selections[j];
            }
        }
    }
};

/**
 * Called when the the preview content is loaded, the selection of axes is changed, or the 'Show Plot' checkbox is toggled.
 * This redraws the plot according to the current state.
 */
const updatePlotContent = function (index: number, scanDataDiv: HTMLDivElement, callback: 'newPlot' | 'react') {
    const graphDivs = scanDataDiv.getElementsByClassName('graphDiv') as HTMLCollectionOf<HTMLDivElement>;

    if (graphDivs.length !== 1 || state.graphStates.length <= index) { return; }

    const graphState = state.graphStates[index];

    const convertToNumberIfNeeded = (selection: number | number[]) => !Array.isArray(selection) ? selection : selection.length > 0 ? selection[0] : -1;
    const convertToArrayIfNeeded = (selection: number | number[]) => Array.isArray(selection) ? selection : [selection];

    if (!graphState.hidden) {
        if (graphState.mode === 'line-y' || graphState.mode === 'line-xy') {
            vscode.postMessage({
                type: 'requestData',
                plotType: 'line',
                graphNumber: index,
                selections: {
                    x: convertToNumberIfNeeded(graphState.selections[0]),
                    y1: convertToArrayIfNeeded(graphState.selections[1]),
                    y2: state.enableRightAxis ? convertToArrayIfNeeded(graphState.selections[2]) : [],
                },
                callback,
            } satisfies MessageFromWebview);
        } else if (graphState.mode === 'heatmap-serial') {
            vscode.postMessage({
                type: 'requestData',
                plotType: 'heatmap',
                dataType: 'serial',
                graphNumber: index,
                selection: convertToNumberIfNeeded(graphState.selections[2]), // z-axis selection
                callback,
            } satisfies MessageFromWebview);
        } else if (graphState.mode === 'heatmap-matrix' || graphState.mode === 'contour-matrix') {
            vscode.postMessage({
                type: 'requestData',
                plotType: graphState.mode === 'heatmap-matrix' ? 'heatmap' : 'contour',
                dataType: 'matrix',
                graphNumber: index,
                callback,
            } satisfies MessageFromWebview);
        } else if (graphState.mode === 'contour-serial') {
            vscode.postMessage({
                type: 'requestData',
                plotType: 'contour',
                dataType: 'serial',
                graphNumber: index,
                selections: {
                    x: convertToNumberIfNeeded(graphState.selections[0]),
                    y: convertToNumberIfNeeded(graphState.selections[1]),
                    z: convertToNumberIfNeeded(graphState.selections[2]),
                },
                callback,
            } satisfies MessageFromWebview);
        }
    }
};

/**
 * Event handler for when a checkbox to show/hide the motor-position table is toggled.
 * It toggles the visibility of the table and saves the state.
 */
const showValueListInputChangeHandler = function (event: Event) {
    let matches: RegExpMatchArray | null;
    if (event.target && event.target instanceof HTMLInputElement && (matches = event.target.id.match(/^showValueListInput(\d+)$/)) !== null) {
        const showValueListInput = event.target;
        const i = parseInt(matches[1]);
        const valueListTable = document.getElementById(`valueListTable${i}`) as HTMLTableElement | null;

        if (!valueListTable || state.tableStates.length <= i) { return; }

        // Show or hide the table according to the checkbox.
        valueListTable.hidden = !showValueListInput.checked;

        // Save the current state.
        state.tableStates[i].hidden = !showValueListInput.checked;
        vscode.setState(state);
    }
};

/**
 * Event handler for when a checkbox to show/hide the plot is toggled.
 * It toggles the visibility of the plot and saves the state.
 */
const showPlotInputChangeHandler = function (event: Event) {
    let matches: RegExpMatchArray | null;
    if (event.target && event.target instanceof HTMLInputElement && (matches = event.target.id.match(/^showPlotInput(\d+)$/)) !== null) {
        const showPlotInput = event.target;
        const i = parseInt(matches[1]);

        const scanDataDiv = document.getElementById(`scanDataDiv${i}`) as HTMLDivElement | null;
        if (!scanDataDiv || state.graphStates.length <= i) { return; }

        const graphDivs = scanDataDiv.getElementsByClassName('graphDiv') as HTMLCollectionOf<HTMLDivElement>;
        if (graphDivs.length !== 1) { return; }

        // Update the state and related attributes of HTML elements according to the checkbox.
        state.graphStates[i].hidden = !showPlotInput.checked;
        updateForShowPlotInput(i, scanDataDiv);

        // Show or hide the plot according to the checkbox.
        if (showPlotInput.checked) {
            updatePlotContent(i, scanDataDiv, 'newPlot');
        } else {
            Plotly.purge(graphDivs[0]);
        }

        // Save the current state.
        vscode.setState(state);
    }
};

/**
 * Event handler for when a dropdown list to select the plot mode (line or heatmap) is changed.
 * It toggles the visibility of the plot and saves the state.
 */
const modeSelectChangeHandler = function (event: Event) {
    let matches: RegExpMatchArray | null;
    if (event.target && event.target instanceof HTMLSelectElement && (matches = event.target.id.match(/^modeSelect(\d+)$/)) !== null) {
        const modeSelect = event.target;
        const i = parseInt(matches[1]);
        const scanDataDiv = document.getElementById(`scanDataDiv${i}`) as HTMLDivElement | null;

        if (!scanDataDiv || state.graphStates.length <= i) { return; }

        // Save the current state.
        state.graphStates[i].mode = modeSelect.value as GraphState['mode'];

        // Update the control elements and redraw the graph.
        updateForModeSelect(i, scanDataDiv, true);
        updateForEnableMultipleSelection(i, scanDataDiv, true);
        updatePlotContent(i, scanDataDiv, 'react');

        // Save the current state.
        vscode.setState(state);
    }
};

/**
 * Event handler for when a dropdown list to select a data array is changed.
 * It redraws the graph according to the new selection and saves the state.
 */
const axisDataSelectChangeHandler = function (event: Event) {
    let matches: RegExpMatchArray | null;
    if (event.target && event.target instanceof HTMLSelectElement && (matches = event.target.id.match(/^x(\d+)DataSelect(\d+)$/)) !== null) {
        const modeSelect = event.target;
        const i = parseInt(matches[2]);
        const j = parseInt(matches[1]);
        const scanDataDiv = document.getElementById(`scanDataDiv${i}`) as HTMLDivElement | null;

        if (!scanDataDiv || state.graphStates.length <= i || j < 0 || j > 2) { return; }

        // Update the state.
        state.graphStates[i].selections[j] = modeSelect.multiple ?
            [...modeSelect.selectedOptions].map(option => option.index) :
            modeSelect.selectedIndex;

        // Redraw the graph.
        updatePlotContent(i, scanDataDiv, 'react');

        // Save the current state.
        vscode.setState(state);
    }
};

/**
 * Event handler for when a checkbox to select the axis scale from log or linear is toggled.
 */
const logInputChangeHandler = function (event: Event) {
    let matches: RegExpMatchArray | null;
    if (event.target && event.target instanceof HTMLInputElement && (matches = event.target.id.match(/^x(\d+)LogInput(\d+)$/)) !== null) {
        const logInput = event.target;
        const i = parseInt(matches[2]);
        const j = parseInt(matches[1]);
        const scanDataDiv = document.getElementById(`scanDataDiv${i}`) as HTMLDivElement | null;

        if (!scanDataDiv || state.graphStates.length <= i || j < 0 || j > 2) { return; }

        const graphState = state.graphStates[i];
        const graphDivs = scanDataDiv.getElementsByClassName('graphDiv') as HTMLCollectionOf<HTMLDivElement>;

        if (graphDivs.length !== 1) { return; }

        if (graphState.mode === 'line-y' || graphState.mode === 'line-xy') {
            // Save the current state.
            graphState.logs[j] = logInput.checked;
            vscode.setState(state);

            // Redraw the graph.
            const axisTypeValue = logInput.checked ? 'log' : 'linear';
            if (j === 1) {
                Plotly.relayout(graphDivs[0], { 'yaxis.type': axisTypeValue });
            } else if (j === 2) {
                Plotly.relayout(graphDivs[0], { 'yaxis2.type': axisTypeValue });
            }
        } else {
            // Do nothing.
        }
    }
};

/**
 * Redraw all graphs according to the current state.
 * This is called when the when the template is loaded, including when the preview is loaded.
 */
const showAllGraphs = (callback: 'newPlot' | 'relayout') => {
    const scanDataDivs = document.body.getElementsByClassName('scanData') as HTMLCollectionOf<HTMLDivElement>;
    for (let i = 0; i < scanDataDivs.length; i++) {
        const scanDataDiv = scanDataDivs[i];

        if (!state.graphStates[i].hidden) {
            if (callback === 'newPlot') {
                updatePlotContent(i, scanDataDiv, callback);
            } else if (callback === 'relayout') {
                const graphDivs = scanDataDiv.getElementsByClassName('graphDiv') as HTMLCollectionOf<HTMLDivElement>;
                if (graphDivs.length !== 1) { continue; }

                Plotly.relayout(graphDivs[0], {
                    template: state.template
                });
            }
        }
    }
};

// Set up an event listener that corresponds to messages from the extension's main process.
window.addEventListener('message', (event: MessageEvent<MessageToWebview>) => {
    const messageIn = event.data;

    if (messageIn.type === 'setTemplate') {
        // Store the template in the state and redraw all graphs.
        // state.template = Plotly.makeTemplate(messageIn.template);
        state.template = messageIn.template;
        vscode.setState(state);
        showAllGraphs(messageIn.callback);
    } else if (messageIn.type === 'scrollPreview') {
        // Scroll the preview to the element with the given id.
        let element: HTMLElement | null;
        if (event.timeStamp - lastScrollEditorTimeStamp > 1500 && (element = document.getElementById(messageIn.elementId)) !== null) {
            // Ignore 'scrollPreview' message soon (< 1.5 sec) after sending 'scrollEditor' message.
            element.scrollIntoView({ block: 'start' });
            lastScrollPreviewTimeStamp = event.timeStamp;
        }
    } else if (messageIn.type === 'updatePlot') {
        // Update the line plot with the given data and redraw it.
        const graphDiv = document.getElementById(`graphDiv${messageIn.graphNumber}`) as HTMLDivElement | null;

        if (!graphDiv || state.graphStates.length <= messageIn.graphNumber) { return; }

        const graphState = state.graphStates[messageIn.graphNumber];

        // `PlotData` in @types/plotly.js@3.0.10 does not have several properties
        // for heatmap and contour plots,
        // so we need to extend the type here.
        type ModifiedPlotlyData = Plotly.PlotData & {
            x0: number,
            dx: number,
            y0: number,
            dy: number,
        };

        const data: Partial<ModifiedPlotlyData>[] = []; //Partial<Plotly.PlotData>[];
        const layout: Partial<Plotly.Layout> = {
            template: state.template,
            height: plotHeight,
            margin: { t: 20, r: 20 },
        };

        if (messageIn.plotType === 'line') {
            // Draw a line plot.
            // if (graphState.mode !== 'line-y' && graphState.mode !== 'line-xy') { return; }

            data.push(...messageIn.y1.map(y_i => {
                return {
                    x: messageIn.x?.array,
                    y: y_i.array,
                    type: 'scatter' as const,
                    name: y_i.label,
                }; // } satisfies Partial<Plotly.PlotData>;
            }));
            data.push(...messageIn.y2.map(y_i => {
                return {
                    x: messageIn.x?.array,
                    y: y_i.array,
                    yaxis: 'y2',
                    type: 'scatter' as const,
                    name: y_i.label,
                }; // } satisfies Partial<Plotly.PlotData>;
            }));

            const getAxisLabel = function (headers: { label: string }[]): string {
                const tmpHeaderLabels = headers.length > 2 ?
                    [...headers.slice(0, 2).map(header => header.label), '...'] :
                    headers.map(header => header.label);
                return tmpHeaderLabels.join(', ');
            };

            layout.xaxis = { title: { text: messageIn.x ? messageIn.x.label : 'point' } };;
            layout.yaxis = {
                title: { text: getAxisLabel(messageIn.y1) },
                type: graphState.logs[1] ? 'log' : 'linear'
            };
            layout.yaxis2 = {
                title: { text: getAxisLabel(messageIn.y2) },
                type: graphState.logs[2] ? 'log' : 'linear',
                overlaying: 'y',
                side: 'right'
            };
        } else if (messageIn.plotType === 'heatmap' || (messageIn.plotType === 'contour' && messageIn.dataType === 'matrix')) {
            // Draw a heatmap or contour plot from the provided 2D array.
            // if (graphState.mode !== 'heatmap-serial' && graphState.mode !== 'heatmap-matrix') { return; }

            data.push({
                x0: messageIn.x ? messageIn.x.start : 0,
                dx: messageIn.x ? messageIn.x.delta : 1,
                y0: messageIn.y ? messageIn.y.start : 0,
                dy: messageIn.y ? messageIn.y.delta : 1,
                z: messageIn.z.array,
                transpose: messageIn.transposed,
                name: messageIn.z.label,
                colorbar: { title: { text: messageIn.z.label, side: 'right' } },
                type: messageIn.plotType, // 'heatmap' or 'contour'
            }); // } satisfies Partial<Plotly.PlotData>);
            layout.xaxis = { title: { text: messageIn.x ? messageIn.x.label : 'point' } };
            layout.yaxis = { title: { text: messageIn.y ? messageIn.y.label : 'point' } };
            // layout.title = { text: messageIn.z.label };
        } else if (messageIn.plotType === 'contour' && messageIn.dataType === 'serial') {
            // Draw a contour plot from the provided 1D arrays.
            data.push({
                x: messageIn.x.array,
                y: messageIn.y.array,
                z: messageIn.z.array,
                name: messageIn.z.label,
                colorbar: { title: { text: messageIn.z.label, side: 'right' } },
                type: 'contour',
            }); // } satisfies Partial<Plotly.PlotData>);
            layout.xaxis = { title: { text: messageIn.x.label } };
            layout.yaxis = { title: { text: messageIn.y.label } };
            // layout.title = { text: messageIn.z.label };
        } else {
            return;
        }

        if (messageIn.action === 'newPlot') {
            Plotly.newPlot(graphDiv, data, layout, { responsive: true });
        } else if (messageIn.action === 'react') {
            Plotly.react(graphDiv, data, layout);
            // console.log('Plot reactivated.');
        }
    } else if (messageIn.type === 'lockPreview') {
        // Update the state to lock or unlock the preview.
        state.lockPreview = messageIn.flag;
        vscode.setState(state);
    } else if (messageIn.type === 'enableMultipleSelection') {
        // Update the state to toggle the multiple selection mode.
        state.enableMultipleSelection = messageIn.flag;
        vscode.setState(state);

        // Update the visibility and attributes of related input elements according to the state.
        const scanDataDivs = document.body.getElementsByClassName('scanData') as HTMLCollectionOf<HTMLDivElement>;
        for (let i = 0; i < scanDataDivs.length; i++) {
            updateForEnableMultipleSelection(i, scanDataDivs[i], true);
            updatePlotContent(i, scanDataDivs[i], 'react');
        }
    } else if (messageIn.type === 'enableRightAxis') {
        // Update the state to toggle the visibility of the right axis.
        state.enableRightAxis = messageIn.flag;
        vscode.setState(state);

        // Update the visibility and attributes of related input elements according to the flag.
        const scanDataDivs = document.body.getElementsByClassName('scanData') as HTMLCollectionOf<HTMLDivElement>;
        for (let i = 0; i < scanDataDivs.length; i++) {
            const x2Spans = scanDataDivs[i].getElementsByClassName('x2 axisSpan') as HTMLCollectionOf<HTMLSpanElement>;
            const x2DataSelects = scanDataDivs[i].getElementsByClassName('x2 dataSelect') as HTMLCollectionOf<HTMLSelectElement>;

            if ([x2DataSelects, x2Spans].some(element => element.length !== 1) || state.graphStates.length < i) { continue; }

            if (state.graphStates[i].mode === 'line-y' || state.graphStates[i].mode === 'line-xy') {
                x2Spans[0].hidden = !messageIn.flag;
            } else {
                // Do nothing.
            }
            updatePlotContent(i, scanDataDivs[i], 'react');
        }
    } else if (messageIn.type === 'enableEditorScroll') {
        scrollsEditor = messageIn.flag;
    } else if (messageIn.type === 'setScrollBehavior') {
        document.documentElement.style.scrollBehavior = messageIn.value;
    } else if (messageIn.type === 'restoreScroll') {
        if (messageIn.delay) {
            // TODO: restore the scroll position after Plotly draws all graphs (if possible).
            // Plotly starts to draw graphs after "DOMContentLoaded" event is fired.
            // Currently just a short delay is inserted before restoring the scroll position.

            // // The delay time is calculated from the number of plots (`== !(hidesPlot)`).
            // const delay = 0 + 50 * Object.entries(state.graphStates).filter(([occurance, graphState]) => {
            //     return !(graphState?.hidden ?? Number(occurance) >= maximumPlots);
            // }).length;

            // The delay time is roughly estimated from the y-position.
            const delay = state.scrollPosition[1] / 20 > 500 ? 500 : state.scrollPosition[1] / 20; // 1 sec or less
            setTimeout(() => {
                window.scrollTo({ left: state.scrollPosition[0], top: state.scrollPosition[1], behavior: 'instant' });
            }, delay);
        } else {
            window.scrollTo({ left: state.scrollPosition[0], top: state.scrollPosition[1], behavior: 'instant' });
        }
    }
});

window.addEventListener('DOMContentLoaded', _event => {
    // Set up value list elements (i.e., motor-position table).
    const valueListDivs = document.body.getElementsByClassName('valueListDiv') as HTMLCollectionOf<HTMLDivElement>;

    // If there are more table states than the number of tables in the HTML, remove the extra states.
    if (state.tableStates.length > valueListDivs.length) {
        state.tableStates.length = valueListDivs.length;
    }

    for (let i = 0; i < valueListDivs.length; i++) {
        const valueListDiv = valueListDivs[i];
        valueListDiv.id = `valueList${i}`;

        const showValueListInputs = valueListDiv.getElementsByClassName('showValueListInput') as HTMLCollectionOf<HTMLInputElement>;
        const valueListTables = valueListDiv.getElementsByClassName('valueListTable') as HTMLCollectionOf<HTMLTableElement>;

        if (showValueListInputs.length !== 1 || valueListTables.length !== 1) {
            break;
        }

        const showValueListInput = showValueListInputs[0];
        const valueListTable = valueListTables[0];
        showValueListInput.id = `showValueListInput${i}`;
        valueListTable.id = `valueListTable${i}`;

        // If the state is fresh, create a new state according to the initial visibility of the tables.
        // Otherwise, set the visibility of HTML elements according to the state.
        if (state.tableStates.length <= i) {
            state.tableStates.push({ hidden: !showValueListInput.checked });
        } else {
            const hideTable = state.tableStates[i].hidden;
            showValueListInput.checked = !hideTable;
            valueListTable.hidden = hideTable;
        }

        // Register event handler for the checkbox to show/hide the table.
        showValueListInputs[0].onchange = showValueListInputChangeHandler;
    }

    // Configure graph elements.
    const scanDataDivs = document.body.getElementsByClassName('scanDataDiv') as HTMLCollectionOf<HTMLDivElement>;

    // If there are more graph states than the number of scan data divs in the HTML, remove the extra states.
    if (state.graphStates.length > scanDataDivs.length) {
        state.graphStates.length = scanDataDivs.length;
    }

    for (let i = 0; i < scanDataDivs.length; i++) {
        const scanDataDiv = scanDataDivs[i];
        scanDataDiv.id = `scanDataDiv${i}`;

        const isGraphStateFresh = state.graphStates.length <= i;

        const showPlotInputs = scanDataDiv.getElementsByClassName('showPlotInput') as HTMLCollectionOf<HTMLInputElement>;
        const modeSelects = scanDataDiv.getElementsByClassName('modeSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const graphDivs = scanDataDiv.getElementsByClassName('graphDiv') as HTMLCollectionOf<HTMLDivElement>;
        const dataSelects = scanDataDiv.getElementsByClassName('dataSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const logInputs = scanDataDiv.getElementsByClassName('logInput') as HTMLCollectionOf<HTMLInputElement>;

        if ([showPlotInputs, modeSelects, graphDivs].some(element => element.length !== 1) || [dataSelects, logInputs].some(element => element.length !== 3)) {
            break;
        }

        showPlotInputs[0].id = `showPlotInput${i}`;
        modeSelects[0].id = `modeSelect${i}`;
        graphDivs[0].id = `graphDiv${i}`;
        for (let j = 0; j < dataSelects.length; j++) {
            dataSelects[j].id = `x${j}DataSelect${i}`;
            logInputs[j].id = `x${j}LogInput${i}`;
        }

        // If the state is fresh, set the state according to the static HTML content.
        // Otherwise, set the attributes of HTML elements according to the state.
        let graphState: GraphState;
        if (isGraphStateFresh) {
            graphState = {
                mode: modeSelects[0].value as GraphState['mode'],
                hidden: !showPlotInputs[0].checked,
                selections: [0, 0, 0], // [...dataSelects].map(dataSelect => dataSelect.selectedIndex) as [number, number, number],
                logs: [...logInputs].map(logInput => logInput.checked) as [boolean, boolean, boolean],
            };
            state.graphStates.push(graphState);
        } else {
            // Resore the state of the graph according to the stored state.
            // Axes-related attributes (selections and log scale) are restored later.
            graphState = state.graphStates[i];
            modeSelects[0].value = graphState.mode;
            showPlotInputs[0].checked = !graphState.hidden;;
        }

        // Update the visibility and attributes of related input elements according to the visibility of the plot.
        updateForShowPlotInput(i, scanDataDiv);

        // Update the visibility and attributes of related input elements according to the current mode.
        // This also refrects the state of 'enableRightAxis'.
        // If the state is fresh, the initial selections are set here.
        updateForModeSelect(i, scanDataDiv, isGraphStateFresh);

        // Update the multiple' attribute of data selection dropdowns according to the state.
        updateForEnableMultipleSelection(i, scanDataDiv, false);

        if (!isGraphStateFresh) {
            // Restore 'selections' attributes here because 'multiple' attributes must be set beforehand.
            for (let j = 0; j < dataSelects.length; j++) {
                const selection = graphState.selections[j];
                if (Array.isArray(selection)) {
                    [...dataSelects[j].options].forEach(option => { option.selected = selection.includes(option.index); });
                } else {
                    dataSelects[j].selectedIndex = selection;
                }
                logInputs[j].checked = graphState.logs[j];
            }
        }

        // Register handlers.
        showPlotInputs[0].onchange = showPlotInputChangeHandler;
        modeSelects[0].onchange = modeSelectChangeHandler;
        for (let j = 0; j < dataSelects.length; j++) {
            dataSelects[j].onchange = axisDataSelectChangeHandler;
            logInputs[j].onchange = logInputChangeHandler;
        }
    }

    vscode.setState(state);

    vscode.postMessage({
        type: 'contentLoaded',
    } satisfies MessageFromWebview);
});


// It is enough to store scroll position only when the page is being closed.
// However, Safari does not support 'scrollend' or `beforeunload` event.
// Considering the case that Visual Studio Code for the Web is used on Safari, 
// the scroll position is also stored in "scroll" event.
window.addEventListener('scrollend', _event => {
    state.scrollPosition = [window.scrollX, window.scrollY];
    vscode.setState(state);
});

window.addEventListener('scroll', event => {
    // The scroll position is stored 1 sec after a user stops scrolloing.
    if (timer1) {
        clearTimeout(timer1);
    }
    timer1 = setTimeout(() => {
        state.scrollPosition = [window.scrollX, window.scrollY];
        vscode.setState(state);
    }, 1000);

    if (!scrollsEditor) {
        return;
    }
    const idPattern = /^l(\d+)*/;

    if (timer2 && event.timeStamp - lastScrollEditorTimeStamp < 50) {
        clearTimeout(timer2);
    }
    timer2 = setTimeout(() => {
        // Send 'scrollEditor' command.
        // Currently the preview controller always sends message whether the setting for scroll synchronization is on or off
        // and the main controller determines whether the editor is scrolled or not.
        if (event.timeStamp - lastScrollPreviewTimeStamp > 1500) {
            // Refrain from sending 'scrollEditor' message soon ( < 1.5 sec) after receiving 'scrollPreview' message.
            let matches: RegExpMatchArray | null;
            for (const element of document.body.childNodes) {
                if (element instanceof HTMLElement && element.getBoundingClientRect().y >= 0 && (matches = element.id.match(idPattern)) !== null) {
                    // console.log(element.id, element.tagName, ...element.classList);
                    vscode.postMessage({
                        type: 'scrollEditor',
                        line: parseInt(matches[1]),
                    } satisfies MessageFromWebview);

                    lastScrollEditorTimeStamp = event.timeStamp;
                    break;
                }
            }
        }
    }, 50);
});
