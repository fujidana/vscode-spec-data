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
        fresh: true,
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
    state.fresh = true;
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

    if (graphState.mode === 'line') {
        if (state.enableMultipleSelection === true) {
            // Set 'size' attributes for all axes, which makes the dropdown lists become list boxes.
            [...dataSelects].forEach(select => {
                select.size = Math.min(4, select.options.length);
            });

            // Set 'multiple' attributes and hide '[none]' option for y1- and y2-axis.
            // Unselect all if '[none]' was selected.
            [dataSelects[1], dataSelects[2]].forEach((select, j) => {
                const noneOption = select.options[select.options.length - 1];
                select.multiple = true;
                if (updateSelection) {
                    if (noneOption.selected) {
                        noneOption.selected = false;
                        select.selectedIndex = -1;
                        graphState.selections[j + 1] = [];
                    } else {
                        graphState.selections[j + 1] = [...select.selectedOptions].map(option => option.index);
                    }
                }

                if (j === 1) { // y2-axis
                    noneOption.hidden = true;
                }
            });
        } else {
            // Clear 'size' attributes for all axes, which makes the list boxes become dropdown lists.
            [...dataSelects].forEach(select => select.size = 0);
            // [...dataSelects].forEach(select => select.removeAttribute('size'));

            // Clear 'multiple' attributes and  show '[none]' option for y1- and y2-axis.
            // Select it if nothing was selected.
            [dataSelects[1], dataSelects[2]].forEach((select, j) => {
                const noneOption = select.options[select.options.length - 1];
                if (updateSelection) {
                    if (select.selectedIndex === -1) {
                        noneOption.selected = true;
                        graphState.selections[j + 1] = noneOption.index;
                    } else {
                        graphState.selections[j + 1] = select.selectedIndex;
                    }
                }
                select.multiple = false;
                // select.removeAttribute('multiple');

                if (j === 1) { // y2-axis
                    noneOption.hidden = false;
                }
            });
        }
    } else {
        // Do nothing for heatmap and contour modes, since they do not support multiple selection.
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
 */
const updateForModeSelect = function (index: number, scanDataDiv: HTMLDivElement) {
    const axisSpans = scanDataDiv.getElementsByClassName('axisSpan') as HTMLCollectionOf<HTMLSpanElement>;
    const dataSelects = scanDataDiv.getElementsByClassName('dataSelect') as HTMLCollectionOf<HTMLSelectElement>;
    const dataAxisNameSpans = scanDataDiv.getElementsByClassName('dataAxisNameSpan') as HTMLCollectionOf<HTMLSpanElement>;

    if ([axisSpans, dataSelects, dataAxisNameSpans].some(element => element.length !== 3) || state.graphStates.length <= index) { return; }

    if (state.graphStates[index].mode === 'line') {
        axisSpans[0].hidden = false;
        axisSpans[1].hidden = false;
        axisSpans[2].hidden = !state.enableRightAxis;
        dataAxisNameSpans[0].innerHTML = '<var>x</var>';
        dataAxisNameSpans[1].innerHTML = '<var>y</var><sub>1</sub>';
        dataAxisNameSpans[2].innerHTML = '<var>y</var><sub>2</sub>';
        dataSelects[0].options[dataSelects[0].options.length - 1].label = '[point]';
        dataSelects[1].options[dataSelects[1].options.length - 1].label = '[none]';
        dataSelects[2].options[dataSelects[2].options.length - 1].label = '[none]';
        dataSelects[1].options[dataSelects[1].options.length - 1].hidden = true;
    } else if (state.graphStates[index].mode === 'heatmap') {
        axisSpans[0].hidden = true;
        axisSpans[1].hidden = true;
        axisSpans[2].hidden = true;
        dataAxisNameSpans[2].innerHTML = '<var>z</var>';
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

    if (!graphState.hidden) {
        if (graphState.mode === 'line') {
            // X-axis is always a single number and thus the following function is safe.
            const convertToNumberIfNeeded = (selection: number | number[]) => Array.isArray(selection) ? selection[0] : selection;
            const convertToArrayIfNeeded = (selection: number | number[]) => Array.isArray(selection) ? selection : [selection];
            const messageOut: MessageFromWebview = {
                type: 'requestData',
                subtype: 'line',
                graphNumber: index,
                selections: {
                    x: convertToNumberIfNeeded(graphState.selections[0]),
                    y1: convertToArrayIfNeeded(graphState.selections[1]),
                    y2: state.enableRightAxis ? convertToArrayIfNeeded(graphState.selections[2]) : [],
                },
                callback,
            };
            vscode.postMessage(messageOut);
        } else if (graphState.mode === 'heatmap') {
            const messageOut: MessageFromWebview = {
                type: 'requestData',
                subtype: 'heatmap',
                graphNumber: index,
                callback,
            };
            vscode.postMessage(messageOut);
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

        const scanDataDiv = document.getElementById(`scanData${i}`) as HTMLDivElement | null;
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
        const scanDataDiv = document.getElementById(`scanData${i}`) as HTMLDivElement | null;

        if (!scanDataDiv || state.graphStates.length <= i) { return; }

        // Save the current state.
        state.graphStates[i].mode = modeSelect.value as GraphState['mode'];

        // Update the control elements and redraw the graph.
        updateForModeSelect(i, scanDataDiv);
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
        const scanDataDiv = document.getElementById(`scanData${i}`) as HTMLDivElement | null;

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
        const scanDataDiv = document.getElementById(`scanData${i}`) as HTMLDivElement | null;

        if (!scanDataDiv || state.graphStates.length <= i || j < 0 || j > 2) { return; }

        const graphState = state.graphStates[i];
        const graphDivs = scanDataDiv.getElementsByClassName('graphDiv') as HTMLCollectionOf<HTMLDivElement>;

        if (graphDivs.length !== 1) { return; }

        if (graphState.mode === 'line') {
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
        } else if (graphState.mode === 'heatmap') {
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

        let data: Partial<Plotly.PlotData>[];
        let layout: Partial<Plotly.Layout> = {
            template: state.template,
            height: plotHeight,
            margin: { t: 20, r: 20 },
        };

        if (messageIn.subtype === 'line') {
            if (graphState.mode !== 'line') { return; }

            const y1Data: Partial<Plotly.PlotData>[] = messageIn.y1.map(y_i => {
                return {
                    x: messageIn.x.array,
                    y: y_i.array,
                    type: 'scatter',
                    name: y_i.label
                };
            });
            const y2Data: Partial<Plotly.PlotData>[] = messageIn.y2.map(y_i => {
                return {
                    x: messageIn.x.array,
                    y: y_i.array,
                    yaxis: 'y2',
                    type: 'scatter',
                    name: y_i.label
                };
            });
            data = y1Data.concat(y2Data);

            const getAxisLabel = function (headers: { label: string }[]): string {
                if (headers.length < 1) {
                    return '';
                } else if (headers.length < 2) {
                    return headers[0].label;
                } else if (headers.length < 3) {
                    return headers[0].label + ', ' + headers[1].label;
                } else {
                    return headers[0].label + ', ' + headers[1].label + ', ...';
                }
            };

            layout.xaxis = { title: { text: messageIn.x.label } };;
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
        } else if (messageIn.subtype === 'heatmap') {
            if (graphState.mode !== 'heatmap') { return; }

            data = [{
                z: messageIn.z,
                type: 'heatmap',
            }];
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
            const modeSelects = scanDataDivs[i].getElementsByClassName('modeSelect') as HTMLCollectionOf<HTMLSelectElement>;
            const x2Spans = scanDataDivs[i].getElementsByClassName('x2 axisSpan') as HTMLCollectionOf<HTMLSpanElement>;
            const x2DataSelects = scanDataDivs[i].getElementsByClassName('x2 dataSelect') as HTMLCollectionOf<HTMLSelectElement>;

            if ([modeSelects, x2DataSelects, x2Spans].some(element => element.length !== 1)) { continue; }

            if (modeSelects[0].value === 'line') {
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
    const valueListDivs = document.body.getElementsByClassName('valueList') as HTMLCollectionOf<HTMLDivElement>;
    for (let i = 0; i < valueListDivs.length; i++) {
        const valueListDiv = valueListDivs[i];
        valueListDiv.setAttribute('id', `valueList${i}`);

        const showValueListInputs = valueListDiv.getElementsByClassName('showValueListInput') as HTMLCollectionOf<HTMLInputElement>;
        const valueListTables = valueListDiv.getElementsByClassName('valueListTable') as HTMLCollectionOf<HTMLTableElement>;

        if (showValueListInputs.length === 1 && valueListTables.length === 1) {
            const showValueListInput = showValueListInputs[0];
            const valueListTable = valueListTables[0];
            showValueListInput.setAttribute('id', `showValueListInput${i}`);
            valueListTable.setAttribute('id', `valueListTable${i}`);

            // If the state is fresh, set the state according to the initial visibility of the tables.
            // Otherwise, set the visibility of HTML elements according to the state.
            if (state.fresh) {
                state.tableStates.push({ hidden: !showValueListInput.checked });
            } else {
                const hideTable = state.tableStates[i].hidden;
                showValueListInput.checked = !hideTable;
                valueListTable.hidden = hideTable;
            }

            // Register event handler for the checkbox to show/hide the table.
            showValueListInputs[0].onchange = showValueListInputChangeHandler;
        } else {
            console.log(`Warning: input or table element in "valueList" div #${i} is missing or duplicated.`);
            if (state.fresh) {
                state.tableStates.push({ hidden: true });
            }
        }
    }

    // Configure graph elements.
    const scanDataDivs = document.body.getElementsByClassName('scanData') as HTMLCollectionOf<HTMLDivElement>;
    for (let i = 0; i < scanDataDivs.length; i++) {
        const scanDataDiv = scanDataDivs[i];
        scanDataDiv.setAttribute('id', `scanData${i}`);

        const showPlotInputs = scanDataDiv.getElementsByClassName('showPlotInput') as HTMLCollectionOf<HTMLInputElement>;
        const modeSelects = scanDataDiv.getElementsByClassName('modeSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const graphDivs = scanDataDiv.getElementsByClassName('graphDiv') as HTMLCollectionOf<HTMLDivElement>;
        const dataSelects = scanDataDiv.getElementsByClassName('dataSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const logInputs = scanDataDiv.getElementsByClassName('logInput') as HTMLCollectionOf<HTMLInputElement>;

        if ([showPlotInputs, modeSelects, graphDivs].some(element => element.length !== 1) || [dataSelects, logInputs].some(element => element.length !== 3)) {
            break;
        }

        showPlotInputs[0].setAttribute('id', `showPlotInput${i}`);
        modeSelects[0].setAttribute('id', `modeSelect${i}`);
        graphDivs[0].setAttribute('id', `graphDiv${i}`);
        for (let j = 0; j < dataSelects.length; j++) {
            dataSelects[j].setAttribute('id', `x${j}DataSelect${i}`);
            logInputs[j].setAttribute('id', `x${j}LogInput${i}`);
        }

        // If the state is fresh, set the state according to the static HTML content.
        // Otherwise, set the attributes of HTML elements according to the state.
        let graphState: GraphState;
        if (state.fresh) {
            graphState = {
                mode: modeSelects[0].value as GraphState['mode'],
                hidden: !showPlotInputs[0].checked,
                selections: [...dataSelects].map(dataSelect => dataSelect.selectedIndex) as [number, number, number],
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
        updateForModeSelect(i, scanDataDiv);

        // Update the multiple' attribute of data selection dropdowns according to the state.
        updateForEnableMultipleSelection(i, scanDataDiv, false);

        if (!state.fresh) {
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

    state.fresh = false;
    vscode.setState(state);

    const messageOut: MessageFromWebview = {
        type: 'contentLoaded',
    };
    vscode.postMessage(messageOut);
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
                    const messageOut: MessageFromWebview = {
                        type: 'scrollEditor',
                        line: parseInt(matches[1])
                    };
                    vscode.postMessage(messageOut);
                    lastScrollEditorTimeStamp = event.timeStamp;
                    break;
                }
            }
        }
    }, 50);
});
