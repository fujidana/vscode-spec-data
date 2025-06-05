/*
 * A JavaScript transpiled from this file is loaded by <script src="..."> in
 * a webview HTML file.
 */

/*
 * At run-time, Plotly is separately loaded by `<script src=""..."">` in a 
 * HTML file and thus, is available in the global scope.
 */
// import Plotly from 'plotly.js-basic-dist-min';
declare const Plotly: any;

import type { MessageFromWebview, MessageToWebview, CallbackType, State, ScanDataState } from './previewTypes';
// type MessageFromWebview = any;
// type MessageToWebview = any;
// type CallbackType = any;
// type State = any;

const vscode = acquireVsCodeApi<State>();

const headDataset = document.head.dataset;
const maximumPlots = parseInt(headDataset.maximumPlots ?? "0");
const plotHeight = parseInt(headDataset.plotHeight ?? "100");
const hideTableGlobal = Boolean(parseInt(headDataset.hideTable ?? "0"));

let state = vscode.getState();
if (state === undefined) {
    state = {
        template: undefined,
        valueList: {},
        scanData: {},
        sourceUri: headDataset.sourceUri ?? '',
        lockPreview: false,
        enableMultipleSelection: Boolean(parseInt(headDataset.enableMultipleSelection ?? "0")),
        enableRightAxis: Boolean(parseInt(headDataset.enableRightAxis ?? "0")),
        scrollY: 0
    };
    vscode.setState(state);
} else if (state.sourceUri !== headDataset.sourceUri) {
    state.valueList = {};
    state.scanData = {};
    state.sourceUri = headDataset.sourceUri ?? '';
    scrollY = 0;
    vscode.setState(state);
}

let lastScrollEditorTimeStamp = 0;
let lastScrollPreviewTimeStamp = 0;

// a handler for a checkbox to control the table visibility
const showValueListInputChangeHandler = function (event: Event) {
    if (event.target && event.target instanceof HTMLInputElement && event.target.parentElement?.parentElement) {
        const div = event.target.parentElement.parentElement;
        const occuranceString = div.dataset.occurance;

        const showValueListInput = event.target;
        const valueListTables = div.getElementsByClassName('valueListTable') as HTMLCollectionOf<HTMLTableElement>;
        if (occuranceString && valueListTables.length === 1) {
            // toggle visibility of the motor-position table
            valueListTables[0].hidden = !showValueListInput.checked;

            // save the current state.
            state.valueList[parseInt(occuranceString)] = { hidden: !showValueListInput.checked };
            vscode.setState(state);
        }
    }
};

// a handler for a checkbox to control the plot visibility
const showPlotInputChangeHandler = function (event: Event) {
    if (event.target && event.target instanceof HTMLInputElement && event.target.parentElement?.parentElement) {
        const div = event.target.parentElement.parentElement;
        const occuranceString = div.dataset.occurance;
        const showPlotInput = event.target;
        const xAxisSelects = div.getElementsByClassName('xAxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const y1AxisSelects = div.getElementsByClassName('yAxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const y2AxisSelects = div.getElementsByClassName('y2AxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const y1LogInputs = div.getElementsByClassName('yLogInput') as HTMLCollectionOf<HTMLInputElement>;
        const y2LogInputs = div.getElementsByClassName('y2LogInput') as HTMLCollectionOf<HTMLInputElement>;
        if (occuranceString && xAxisSelects.length === 1 && y1AxisSelects.length === 1 && y2AxisSelects.length === 1 && y1LogInputs.length === 1 && y2LogInputs.length === 1) {
            const occurance = parseInt(occuranceString);

            const xAxisSelect = xAxisSelects[0];
            const y1AxisSelect = y1AxisSelects[0];
            const y2AxisSelect = y2AxisSelects[0];
            const y1LogInput = y1LogInputs[0];
            const y2LogInput = y2LogInputs[0];

            const xIndex = xAxisSelect.hidden ? -1 : xAxisSelect.selectedIndex;
            const y1Indexes = [...y1AxisSelect.selectedOptions].map(option => option.index);
            const y2Indexes = y2AxisSelect.hidden ? [] : [...y2AxisSelect.selectedOptions].map(option => option.index);

            // show or hide the graph
            if (showPlotInput.checked) {
                const messageOut: MessageFromWebview = {
                    type: 'requestPlotData',
                    occurance: occurance,
                    indexes: { x: xIndex, y1: y1Indexes, y2: y2Indexes },
                    callback: 'newPlot'
                };
                vscode.postMessage(messageOut);
            } else {
                Plotly.purge('plotly' + occuranceString);
            }

            // enable or disable the dropdown axis selectors
            xAxisSelect.disabled = !showPlotInput.checked;
            y1AxisSelect.disabled = !showPlotInput.checked;
            y2AxisSelect.disabled = !showPlotInput.checked;
            y1LogInput.disabled = !showPlotInput.checked;
            y2LogInput.disabled = !showPlotInput.checked;

            // save the current state
            const newScanData: Required<ScanDataState> = {
                xIndex, y1Indexes, y2Indexes, y1Log: y1LogInput.checked, y2Log: y2LogInput.checked, hidden: !showPlotInput.checked
            };
            state.scanData[occurance] = newScanData;
            vscode.setState(state);
        }
    }
};

// a handler for a select (dropdown list) to select columns for X and Y axes.
const plotAxisSelectChangeHandler = function (event: Event) {
    if (event.target && event.target instanceof HTMLSelectElement && event.target.parentElement?.parentElement) {
        const div = event.target.parentElement.parentElement;
        const occuranceString = div.dataset.occurance;
        const xAxisSelects = div.getElementsByClassName('xAxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const y1AxisSelects = div.getElementsByClassName('yAxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const y2AxisSelects = div.getElementsByClassName('y2AxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        if (occuranceString && xAxisSelects.length === 1 && y1AxisSelects.length === 1 && y2AxisSelects.length === 1) {
            const occurance = parseInt(occuranceString);
            const xAxisSelect = xAxisSelects[0];
            const y1AxisSelect = y1AxisSelects[0];
            const y2AxisSelect = y2AxisSelects[0];

            const xIndex = xAxisSelect.hidden ? -1 : xAxisSelect.selectedIndex;
            const y1Indexes = [...y1AxisSelect.selectedOptions].map(option => option.index);
            const y2Indexes = y2AxisSelect.hidden ? [] : [...y2AxisSelect.selectedOptions].map(option => option.index);

            // redraw the graph
            const messageOut: MessageFromWebview = {
                type: 'requestPlotData',
                occurance: occurance,
                indexes: { x: xIndex, y1: y1Indexes, y2: y2Indexes },
                callback: 'react'
            };
            vscode.postMessage(messageOut);

            // save the current state
            const newScanDataStatus: Partial<ScanDataState> = {
                xIndex,
                y1Indexes,
                y2Indexes,
            };
            state.scanData[occurance] = occurance in state.scanData ? { ...state.scanData[occurance], ...newScanDataStatus } : newScanDataStatus;
            vscode.setState(state);
        }
    }
};

// a handler for a checkbox to select the axis scale from log or linear.
const logAxisInputChangeHandler = function (event: Event) {
    if (event.target && event.target instanceof HTMLInputElement && event.target.parentElement?.parentElement) {
        const div = event.target.parentElement.parentElement;
        const occuranceString = div.dataset.occurance;
        const logAxisInput = event.target;
        const plotDivs = div.getElementsByClassName('scanDataPlot') as HTMLCollectionOf<HTMLDivElement>;
        if (occuranceString && plotDivs.length === 1) {
            const occurance = parseInt(occuranceString);

            let layout: any; // Partial<Plotly.Layout>;
            let newScanDataStatus: Partial<ScanDataState>;
            const axisTypeValue = logAxisInput.checked ? 'log' : 'linear';
            if (logAxisInput.id.startsWith('y2LogInput')) {
                layout = { 'yaxis2.type': axisTypeValue };
                newScanDataStatus = { y2Log: logAxisInput.checked };
            } else {
                layout = { 'yaxis.type': axisTypeValue };
                newScanDataStatus = { y1Log: logAxisInput.checked };
            }

            Plotly.relayout(plotDivs[0], layout);
            state.scanData[occurance] = occurance in state.scanData ? { ...state.scanData[occurance], ...newScanDataStatus } : newScanDataStatus;
            vscode.setState(state);
        }
    }
};

// show all graphs
const showAllGraphs = (callback: CallbackType) => {
    for (const div of document.body.getElementsByClassName('scanData') as HTMLCollectionOf<HTMLDivElement>) {
        const occuranceString = div.dataset.occurance;
        const showPlotInputs = div.getElementsByClassName('showPlotInput') as HTMLCollectionOf<HTMLInputElement>;
        const xAxisSelects = div.getElementsByClassName('xAxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const y1AxisSelects = div.getElementsByClassName('yAxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const y2AxisSelects = div.getElementsByClassName('y2AxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const plotDivs = div.getElementsByClassName('scanDataPlot') as HTMLCollectionOf<HTMLDivElement>;
        if (occuranceString && showPlotInputs.length === 1 && xAxisSelects.length === 1 && y1AxisSelects.length === 1 && y2AxisSelects.length === 1 && plotDivs.length === 1) {
            if (showPlotInputs[0].checked) {
                if (callback === 'newPlot') {
                    const xAxisSelect = xAxisSelects[0];
                    const y1AxisSelect = y1AxisSelects[0];
                    const y2AxisSelect = y2AxisSelects[0];

                    const xIndex = xAxisSelect.hidden ? -1 : xAxisSelect.selectedIndex;
                    const y1Indexes = [...y1AxisSelect.selectedOptions].map(option => option.index);
                    const y2Indexes = y2AxisSelect.hidden ? [] : [...y2AxisSelect.selectedOptions].map(option => option.index);

                    // redraw the graph
                    const messageOut: MessageFromWebview = {
                        type: 'requestPlotData',
                        occurance: parseInt(occuranceString),
                        indexes: { x: xIndex, y1: y1Indexes, y2: y2Indexes },
                        callback: callback
                    };
                    vscode.postMessage(messageOut);
                } else if (callback === 'relayout') {
                    Plotly.relayout(plotDivs[0], {
                        template: state.template
                    });
                }
            }
        }
    }
};

window.addEventListener('message', (event: MessageEvent<MessageToWebview>) => {
    const messageIn = event.data;

    if (messageIn.type === 'setTemplate') {
        // state.template = Plotly.makeTemplate(messageIn.template);
        state.template = messageIn.template;
        vscode.setState(state);
        showAllGraphs(messageIn.callback);
    } else if (messageIn.type === 'scrollPreview') {
        const element = document.getElementById(messageIn.elementId);
        if (event.timeStamp - lastScrollEditorTimeStamp > 1500 && element) {
            // Ignore 'scrollPreview' message soon (< 1.5 sec) after sending 'scrollEditor' message.
            element.scrollIntoView({
                block: 'start'
            });
            lastScrollPreviewTimeStamp = event.timeStamp;
        }
    } else if (messageIn.type === 'updatePlot') {
        const graphDiv = document.getElementById(`plotly${messageIn.occurance}`);
        const y1LogInput = document.getElementById(`yLogInput${messageIn.occurance}`);
        const y2LogInput = document.getElementById(`y2LogInput${messageIn.occurance}`);
        if (graphDiv && y1LogInput && y2LogInput) {
            const y1Data: Partial<Plotly.PlotData>[] = messageIn.y1.map(y_i => {
                return {
                    x: messageIn.x.array,
                    y: y_i.array,
                    type: 'scatter',
                    name: y_i.label
                };
            });
            const y2Data: Partial<Plotly.PlotData>[] = messageIn.y2.map(y1_i => {
                return {
                    x: messageIn.x.array,
                    y: y1_i.array,
                    yaxis: 'y2',
                    type: 'scatter',
                    name: y1_i.label
                };
            });
            const data = y1Data.concat(y2Data);

            const getAxisLabel = function (headers: { label: string }[]): string {
                if (headers.length < 1) {
                    return '';
                } else if (headers.length < 2) {
                    return headers[0].label;
                } else if (headers.length < 3) {
                    return headers[0].label + ', ' + headers[1].label;
                } else {
                    return headers[0].label + ', ' + headers[1].label + ',';
                }
            };
            const layout: Partial<Plotly.Layout> = {
                template: state.template,
                height: plotHeight,
                xaxis: { title: { text: messageIn.x.label } },
                yaxis: {
                    title: { text: getAxisLabel(messageIn.y1) },
                    type: (y1LogInput as HTMLInputElement).checked ? 'log' : 'linear'
                },
                yaxis2: {
                    title: { text: getAxisLabel(messageIn.y2) },
                    type: (y2LogInput as HTMLInputElement).checked ? 'log' : 'linear',
                    overlaying: 'y',
                    side: 'right'
                },
                margin: { t: 20, r: 20 }
            };

            if (messageIn.action === 'newPlot') {
                graphDiv.hidden = false;
                Plotly.newPlot(graphDiv, data, layout, { responsive: true });
            } else if (messageIn.action === 'react') {
                Plotly.react(graphDiv, data, layout);
            }
        }
    } else if (messageIn.type === 'lockPreview') {
        state.lockPreview = messageIn.flag;
        vscode.setState(state);
    } else if (messageIn.type === 'enableMultipleSelection') {
        const xAxisSelects = document.body.getElementsByClassName('xAxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const y1AxisSelects = document.body.getElementsByClassName('yAxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const y2AxisSelects = document.body.getElementsByClassName('y2AxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        if (messageIn.flag === true) {
            // When swithing to multiple mode,
            // Set 'size' attributes for x-axis. The value is stored in the dataset region of the element.
            [...xAxisSelects].forEach(axisSelect => {
                axisSelect.setAttribute('size', axisSelect.dataset.sizeForMultiple ?? '0');
            });
            // Hide '[none]' option in y2-axis. Unselect all if '[none]' was selected, 
            [...y2AxisSelects].forEach(axisSelect => {
                const noneOption = axisSelect.options[axisSelect.options.length - 1];
                noneOption.hidden = true;
                if (noneOption.selected) {
                    noneOption.selected = false;
                    axisSelect.selectedIndex = -1;
                }
            });
            // Set 'multiple' and 'size' attributes for y1- and y2-axis.
            [...y1AxisSelects, ...y2AxisSelects].forEach(axisSelect => {
                axisSelect.setAttribute('multiple', '');
                axisSelect.setAttribute('size', axisSelect.dataset.sizeForMultiple ?? '0');
            });
        } else if (messageIn.flag === false) {
            // When multiple mode turns off,
            // Remove 'size' attributes for x-axis. Otherwise, the the element does not become a compact dropdown list.
            [...xAxisSelects].forEach(axisSelect => {
                axisSelect.removeAttribute('size');
            });
            // Show '[none]' option in y2-axis, then select it if nothing was selected in multiple mode.
            [...y2AxisSelects].forEach(axisSelect => {
                const noneOption = axisSelect.options[axisSelect.options.length - 1];
                noneOption.hidden = false;
                if (axisSelect.selectedIndex === -1) {
                    noneOption.selected = true;
                }
            });
            // Remove 'multiple' and 'size' attributes from y1- nad y2-axis.
            [...y1AxisSelects, ...y2AxisSelects].forEach(axisSelect => {
                axisSelect.removeAttribute('multiple');
                axisSelect.removeAttribute('size');
            });
        }
        state.enableMultipleSelection = messageIn.flag;
        vscode.setState(state);
    } else if (messageIn.type === 'enableRightAxis') {
        const y2Elements = document.body.getElementsByClassName('y2') as HTMLCollectionOf<HTMLElement>;
        [...y2Elements].forEach(element => element.hidden = !messageIn.flag);
        state.enableRightAxis = messageIn.flag;
        vscode.setState(state);
    } else if (messageIn.type === 'setScrollBehavior') {
        document.documentElement.style.scrollBehavior = messageIn.value;
    }
});

window.addEventListener('DOMContentLoaded', _event => {
    // Initialize prescan position elements
    for (const div of document.getElementsByClassName('valueList') as HTMLCollectionOf<HTMLDivElement>) {
        const occuranceString = div.dataset.occurance;
        const showValueListInputs = div.getElementsByClassName('showValueListInput') as HTMLCollectionOf<HTMLInputElement>;
        const valueListTables = div.getElementsByClassName('valueListTable') as HTMLCollectionOf<HTMLTableElement>;

        if (occuranceString && showValueListInputs.length === 1 && valueListTables.length === 1) {
            const occurance = parseInt(occuranceString);
            const hidesTable = state.valueList[occurance]?.hidden ?? hideTableGlobal;
            // const hidesTable: boolean = occurance in state.valueList && state.valueList[occurance].hidden !== undefined ? state.valueList[occurance].hidden : hideTableGlobal;

            // set the initial state
            showValueListInputs[0].checked = !hidesTable;
            valueListTables[0].hidden = hidesTable;

            // register a handler.
            showValueListInputs[0].onchange = showValueListInputChangeHandler;
        }
    }

    // Initialize scan data elements
    for (const div of document.getElementsByClassName('scanData') as HTMLCollectionOf<HTMLDivElement>) {
        const occuranceString = div.dataset.occurance;
        const showPlotInputs = div.getElementsByClassName('showPlotInput') as HTMLCollectionOf<HTMLInputElement>;
        const xAxisSelects = div.getElementsByClassName('xAxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const y1AxisSelects = div.getElementsByClassName('yAxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const y2AxisSelects = div.getElementsByClassName('y2AxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const y1LogInputs = div.getElementsByClassName('yLogInput') as HTMLCollectionOf<HTMLInputElement>;
        const y2LogInputs = div.getElementsByClassName('y2LogInput') as HTMLCollectionOf<HTMLInputElement>;

        if (occuranceString && showPlotInputs.length === 1 && xAxisSelects.length === 1 && y1AxisSelects.length === 1 && y2AxisSelects.length === 1 && y1LogInputs.length === 1 && y2LogInputs.length === 1) {
            const occurance = parseInt(occuranceString);
            const showPlotInput = showPlotInputs[0];
            const xAxisSelect = xAxisSelects[0];
            const y1AxisSelect = y1AxisSelects[0];
            const y2AxisSelect = y2AxisSelects[0];
            const y1LogInput = y1LogInputs[0];
            const y2LogInput = y2LogInputs[0];

            // Show Plot checkboxes
            // set the initial state.
            const hidesPlot = state.scanData[occurance]?.hidden ?? occurance >= maximumPlots;
            // const hidesPlot: boolean = occurance in state.scanData && state.scanData[occurance].hidden !== undefined ? state.scanData[occurance].hidden : occurance >= maximumPlots;
            showPlotInput.checked = !hidesPlot;

            // axis selectors and log checkboxes
            // set the initial state.
            xAxisSelect.disabled = hidesPlot;
            y1AxisSelect.disabled = hidesPlot;
            y2AxisSelect.disabled = hidesPlot;
            y1LogInput.disabled = hidesPlot;
            y2LogInput.disabled = hidesPlot;

            // toggle multiple slection: start
            // This does essentially the same as "enableMultipleSelection" event handler.
            if (state.enableMultipleSelection) {
                xAxisSelect.setAttribute('size', xAxisSelect.dataset.sizeForMultiple ?? "0");
                y1AxisSelect.setAttribute('multiple', '');
                y1AxisSelect.setAttribute('size', y1AxisSelect.dataset.sizeForMultiple ?? "0");
                y2AxisSelect.setAttribute('multiple', '');
                y2AxisSelect.setAttribute('size', y2AxisSelect.dataset.sizeForMultiple ?? "0");
            } else {
                xAxisSelect.removeAttribute('size');
                y1AxisSelect.removeAttribute('size');
                y2AxisSelect.removeAttribute('size');
            }
            // toggle multiple slection: end

            // set the data selection.
            // xAxisSelect.selectedIndex = state.scanData[occurance]?.xIndex ?? 0;
            xAxisSelect.selectedIndex = state.scanData[occurance]?.xIndex ?? (xAxisSelect.length > 2 ? 0 : 1);

            const y1Indexes = state.scanData[occurance]?.y1Indexes ?? [y1AxisSelect.length - 1];
            // y1Indexes.forEach(i => y1AxisSelect.options[i].selected = true);
            [...y1AxisSelect.options].forEach(option => { option.selected = y1Indexes.includes(option.index); });

            const y2Indexes = state.scanData[occurance]?.y2Indexes ?? [y2AxisSelect.length - 1];
            // y2Indexes.forEach(i => y2AxisSelect.options[i].selected = true);
            [...y2AxisSelect.options].forEach(option => { option.selected = y2Indexes.includes(option.index); });

            // toggle multiple slection: start
            // This does essentially the same as "enableMultipleSelection" event handler.
            // If multiple selection mode is enabled and the stored state indicates [none] is selected, deselect it.
            if (state.enableMultipleSelection) {
                y2AxisSelect.options[y2AxisSelect.length - 1].selected = false;
                y2AxisSelect.options[y2AxisSelect.options.length - 1].hidden = true;
            } else {
                y2AxisSelect.options[y2AxisSelect.options.length - 1].hidden = false;
            }
            // toggle multiple slection: end

            // toggle right axis: start
            // This does essentially the same as "enableRightAxis" event handler.
            const y2Elements = div.getElementsByClassName('y2') as HTMLCollectionOf<HTMLElement>;
            [...y2Elements].forEach(element => element.hidden = !state.enableRightAxis);
            // toggle right axis: end

            y1LogInput.checked = state.scanData[occurance]?.y1Log ?? false;
            y2LogInput.checked = state.scanData[occurance]?.y2Log ?? false;

            // register a handler
            showPlotInput.onchange = showPlotInputChangeHandler;
            xAxisSelect.onchange = plotAxisSelectChangeHandler;
            y1AxisSelect.onchange = plotAxisSelectChangeHandler;
            y2AxisSelect.onchange = plotAxisSelectChangeHandler;
            y1LogInput.onchange = logAxisInputChangeHandler;
            y2LogInput.onchange = logAxisInputChangeHandler;
        }
    }

    const messageOut: MessageFromWebview = {
        type: 'contentLoaded',
    };
    vscode.postMessage(messageOut);

    if (state.scrollY > 0) {
        window.scrollTo({ top: state.scrollY, left: 0, behavior: 'instant' });
    }
});

let timer1: NodeJS.Timeout | undefined;
let timer2: NodeJS.Timeout | undefined;

const idPattern = /^l(\d+)*/;

window.addEventListener("scroll", event => {
    // The scroll position is stored 1 sec after a user stops scrolloing.
    if (timer1) {
        clearTimeout(timer1);
    }
    timer1 = setTimeout(() => {
        state.scrollY = window.scrollY;
        vscode.setState(state);
    }, 1000);

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