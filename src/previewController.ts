/*
 * TypeScript script that is loaded by <script src="..."> in a webview html file.
 * The script is not directly executed in the main thread of the extension and thus, compiled separately 
 * from other sources.
 */

/*
 * @types/plotly.js and @types/plotly.js-basic-dist-min distributed by npm does not contain `makeTemplate()` function
 * and thus, syntax error is thrown when used as type definitions. 
 * Therefore, `declare` is used instead.
 */
declare const Plotly: any;

import type { MessageFromWebview, MessageToWebview, CallbackType, State } from './previewTypes';
// type MessageFromWebview = any;
// type MessageToWebview = any;
// type CallbackType = any;
// type State = any;

const vscode = acquireVsCodeApi<State>();

const headDataset = document.head.dataset;
const maximumPlots = headDataset.maximumPlots !== undefined ? parseInt(headDataset.maximumPlots) : 0;
const plotHeight = headDataset.plotHeight !== undefined ? parseInt(headDataset.plotHeight) : 0;
const hideTableGlobal = headDataset.hideTable !== undefined ? Boolean(parseInt(headDataset.hideTable)) : false;
const sourceUri = headDataset.sourceUri !== undefined ? headDataset.sourceUri : '';

let state = vscode.getState();
if (state === undefined || state.sourceUri !== sourceUri) {
    const enableMultipleSelection = headDataset.enableMultipleSelection !== undefined ? Boolean(parseInt(headDataset.enableMultipleSelection)) : false;
    state = {
        template: undefined,
        valueList: {},
        scanData: {},
        sourceUri: sourceUri,
        lockPreview: false,
        enableMultipleSelection: enableMultipleSelection,
    };
    vscode.setState(state);
}

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
        const logAxisInputs = div.getElementsByClassName('logAxisInput') as HTMLCollectionOf<HTMLInputElement>;
        if (occuranceString && xAxisSelects.length === 1 && y1AxisSelects.length === 1 && y2AxisSelects.length === 1 && logAxisInputs.length === 1) {
            const occurance = parseInt(occuranceString);

            const xAxisSelect = xAxisSelects[0];
            const y1AxisSelect = y1AxisSelects[0];
            const y2AxisSelect = y2AxisSelects[0];
            const logAxisInput = logAxisInputs[0];

            const xIndex = xAxisSelect.hidden ? -1 : xAxisSelect.selectedIndex;
            const y1Indexes = [...y1AxisSelect.selectedOptions].map(option => option.index);
            const y2Indexes = y2AxisSelect.hidden ? [] : [...y2AxisSelect.selectedOptions].map(option => option.index);

            // show or hide the graph
            if (showPlotInput.checked) {
                const messageOut: MessageFromWebview = {
                    type: 'requestPlotData',
                    occurance: occurance,
                    indexes: { x: xIndex, y1: y1Indexes, y2: y2Indexes },
                    logAxis: logAxisInput.checked,
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
            logAxisInput.disabled = !showPlotInput.checked;

            // save the current state
            state.scanData[occurance] = {
                x: xIndex,
                y1: y1Indexes,
                y2: y2Indexes,
                hidden: !showPlotInput.checked,
                logAxis: logAxisInput.checked
            };
            vscode.setState(state);
        }
    }
};

// a handler for a select (dropdown list) to select columns for X and Y axes.
const plotAxisSelectChangeHandler = function (event: Event) {
    if (event.target && event.target instanceof HTMLSelectElement && event.target.parentElement?.parentElement) {
        const div = event.target.parentElement.parentElement;
        const occuranceString = div.dataset.occurance;
        const showPlotInputs = div.getElementsByClassName('showPlotInput') as HTMLCollectionOf<HTMLInputElement>;
        const xAxisSelects = div.getElementsByClassName('xAxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const y1AxisSelects = div.getElementsByClassName('yAxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const y2AxisSelects = div.getElementsByClassName('y2AxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const logAxisInputs = div.getElementsByClassName('logAxisInput') as HTMLCollectionOf<HTMLInputElement>;
        if (occuranceString && showPlotInputs.length === 1 && xAxisSelects.length === 1 && y1AxisSelects.length === 1 && y2AxisSelects.length === 1 && logAxisInputs.length === 1) {
            const occurance = parseInt(occuranceString);
            const showPlotInput = showPlotInputs[0];
            const xAxisSelect = xAxisSelects[0];
            const y1AxisSelect = y1AxisSelects[0];
            const y2AxisSelect = y2AxisSelects[0];
            const logAxisInput = logAxisInputs[0];

            const xIndex = xAxisSelect.hidden ? -1 : xAxisSelect.selectedIndex;
            const y1Indexes = [...y1AxisSelect.selectedOptions].map(option => option.index);
            const y2Indexes = y2AxisSelect.hidden ? [] : [...y2AxisSelect.selectedOptions].map(option => option.index);

            // redraw the graph
            const messageOut: MessageFromWebview = {
                type: 'requestPlotData',
                occurance: occurance,
                indexes: { x: xIndex, y1: y1Indexes, y2: y2Indexes },
                logAxis: logAxisInput.checked,
                callback: 'react'
            };
            vscode.postMessage(messageOut);

            // save the current state
            state.scanData[occurance] = {
                x: xIndex,
                y1: y1Indexes,
                y2: y2Indexes,
                hidden: !showPlotInput.checked,
                logAxis: logAxisInput.checked
            };
            vscode.setState(state);
        }
    }
};

// a handler for a checkbox to select the axis scale from log or linear.
const logAxisInputChangeHander = function (event: Event) {
    if (event.target && event.target instanceof HTMLInputElement && event.target.parentElement?.parentElement) {
        const div = event.target.parentElement.parentElement;
        const occuranceString = div.dataset.occurance;
        const logAxisInput = event.target;
        const showPlotInputs = div.getElementsByClassName('showPlotInput') as HTMLCollectionOf<HTMLInputElement>;
        const xAxisSelects = div.getElementsByClassName('xAxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const y1AxisSelects = div.getElementsByClassName('yAxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const y2AxisSelects = div.getElementsByClassName('y2AxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const plotDivs = div.getElementsByClassName('scanDataPlot') as HTMLCollectionOf<HTMLDivElement>;
        if (occuranceString && showPlotInputs.length === 1 && xAxisSelects.length === 1 && y1AxisSelects.length === 1 && y2AxisSelects.length === 1 && plotDivs.length === 1) {
            const occurance = parseInt(occuranceString);
            const showPlotInput = showPlotInputs[0];
            const xAxisSelect = xAxisSelects[0];
            const y1AxisSelect = y1AxisSelects[0];
            const y2AxisSelect = y2AxisSelects[0];

            // redraw the graph
            Plotly.relayout(plotDivs[0], {
                'yaxis.type': logAxisInput.checked ? 'log' : 'linear',
            });

            const xIndex = xAxisSelect.hidden ? -1 : xAxisSelect.selectedIndex;
            const y1Indexes = [...y1AxisSelect.selectedOptions].map(option => option.index);
            const y2Indexes = y2AxisSelect.hidden ? [] : [...y2AxisSelect.selectedOptions].map(option => option.index);

            // save the current state
            state.scanData[occurance] = {
                x: xIndex,
                y1: y1Indexes,
                y2: y2Indexes,
                hidden: !showPlotInput.checked,
                logAxis: logAxisInput.checked
            };
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
        const logAxisInputs = div.getElementsByClassName('logAxisInput') as HTMLCollectionOf<HTMLInputElement>;
        const plotDivs = div.getElementsByClassName('scanDataPlot') as HTMLCollectionOf<HTMLDivElement>;
        if (occuranceString && showPlotInputs.length === 1 && xAxisSelects.length === 1 && y1AxisSelects.length === 1 && y2AxisSelects.length === 1 && logAxisInputs.length === 1 && plotDivs.length === 1) {
            if (showPlotInputs[0].checked) {
                if (callback === 'newPlot') {
                    const xAxisSelect = xAxisSelects[0];
                    const y1AxisSelect = y1AxisSelects[0];
                    const y2AxisSelect = y2AxisSelects[0];
                    const logAxisInput = logAxisInputs[0];

                    const xIndex = xAxisSelect.hidden ? -1 : xAxisSelect.selectedIndex;
                    const y1Indexes = [...y1AxisSelect.selectedOptions].map(option => option.index);
                    const y2Indexes = y2AxisSelect.hidden ? [] : [...y2AxisSelect.selectedOptions].map(option => option.index);

                    // redraw the graph
                    const messageOut: MessageFromWebview = {
                        type: 'requestPlotData',
                        occurance: parseInt(occuranceString),
                        indexes: { x: xIndex, y1: y1Indexes, y2: y2Indexes },
                        logAxis: logAxisInput.checked,
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
        state.template = Plotly.makeTemplate(messageIn.template);
        vscode.setState(state);
        showAllGraphs(messageIn.callback);
    } else if (messageIn.type === 'scrollToElement') {
        const element = document.getElementById(messageIn.elementId);
        if (element) {
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    } else if (messageIn.type === 'updatePlot') {
        const graphDiv = document.getElementById(`plotly${messageIn.occurance}`);
        if (graphDiv) {
            const y1Data = messageIn.y1.map(y_i => {
                return {
                    x: messageIn.x.array,
                    y: y_i.array,
                    type: 'scatter',
                    name: y_i.label
                };
            });
            const y2Data = messageIn.y2.map(y1_i => {
                return {
                    x: messageIn.x.array,
                    y: y1_i.array,
                    yaxis: 'y2',
                    type: 'scatter',
                    name: y1_i.label
                };
            });
            const data = y1Data.concat(y2Data);

            let y1Label: string;
            if (messageIn.y1.length > 2) {
                y1Label = `${messageIn.y1[0].label}, ${messageIn.y1[1].label}, ...`;
            } else if (messageIn.y1.length === 2) {
                y1Label = `${messageIn.y1[0].label}, ${messageIn.y1[1].label}`;
            } else {
                y1Label = messageIn.y1[0].label;
            }
            let y2Label: string = 'aaa';
            if (messageIn.y2.length > 2) {
                y2Label = `${messageIn.y2[0].label}, ${messageIn.y2[1].label}, ...`;
            } else if (messageIn.y2.length > 1) {
                y2Label = `${messageIn.y2[0].label}, ${messageIn.y2[1].label}`;
            } else if (messageIn.y2.length > 0) {
                y2Label = messageIn.y2[0].label;
            }

            const layout = {
                template: state.template,
                height: plotHeight,
                xaxis: { title: messageIn.x.label },
                yaxis: {
                    title: y1Label,
                    type: messageIn.logAxis ? 'log' : 'linear'
                },
                yaxis2: {
                    title: y2Label,
                    type: messageIn.logAxis ? 'log' : 'linear',
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
            [...xAxisSelects].forEach(axisSelect => {
                axisSelect.setAttribute('size', axisSelect.dataset.sizeForMultiple ?? '0');
            });
            [...y1AxisSelects, ...y2AxisSelects].forEach(axisSelect => {
                axisSelect.setAttribute('multiple', '');
                axisSelect.setAttribute('size', axisSelect.dataset.sizeForMultiple ?? '0');
            });
        } else if (messageIn.flag === false) {
            [...xAxisSelects].forEach(axisSelect => {
                axisSelect.removeAttribute('size');
            });
            [...y1AxisSelects, ...y2AxisSelects].forEach(axisSelect => {
                axisSelect.removeAttribute('multiple');
                axisSelect.removeAttribute('size');
            });
        }
        state.enableMultipleSelection = messageIn.flag;
        vscode.setState(state);
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
            const hideTable: boolean = occurance in state.valueList && state.valueList[occurance].hidden !== undefined ? state.valueList[occurance].hidden : hideTableGlobal;

            // register a handler.
            showValueListInputs[0].onchange = showValueListInputChangeHandler;

            // set the initial state
            showValueListInputs[0].checked = !hideTable;
            valueListTables[0].hidden = hideTable;
        }
    }

    // Initialize scan data elements
    for (const div of document.getElementsByClassName('scanData') as HTMLCollectionOf<HTMLDivElement>) {
        const occuranceString = div.dataset.occurance;
        const showPlotInputs = div.getElementsByClassName('showPlotInput') as HTMLCollectionOf<HTMLInputElement>;
        const xAxisSelects = div.getElementsByClassName('xAxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const y1AxisSelects = div.getElementsByClassName('yAxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const y2AxisSelects = div.getElementsByClassName('y2AxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const logAxisInputs = div.getElementsByClassName('logAxisInput') as HTMLCollectionOf<HTMLInputElement>;

        if (occuranceString && showPlotInputs.length === 1 && xAxisSelects.length === 1 && y1AxisSelects.length === 1 && y2AxisSelects.length === 1 && logAxisInputs.length === 1) {
            const occurance = parseInt(occuranceString);
            const showPlotInput = showPlotInputs[0];
            const xAxisSelect = xAxisSelects[0];
            const y1AxisSelect = y1AxisSelects[0];
            const y2AxisSelect = y2AxisSelects[0];
            const logAxisInput = logAxisInputs[0];
            const scanDataState = occurance in state.scanData ? state.scanData[occurance] : {
                hidden: occurance >= maximumPlots,
                x: xAxisSelect.length > 2 ? 0 : 1,
                y1: [y1AxisSelect.length - 1],
                y2: [y2AxisSelect.length - 1],
                logAxis: false
            };

            // Show Plot checkboxes
            // register a handler
            showPlotInput.onchange = showPlotInputChangeHandler;

            // set the initial state.
            showPlotInput.checked = !scanDataState.hidden;

            // Axis selectors
            // register a handler
            xAxisSelect.onchange = plotAxisSelectChangeHandler;
            y1AxisSelect.onchange = plotAxisSelectChangeHandler;
            y2AxisSelect.onchange = plotAxisSelectChangeHandler;
            logAxisInput.onchange = logAxisInputChangeHander;

            // set the initial state.
            xAxisSelect.disabled = scanDataState.hidden;
            y1AxisSelect.disabled = scanDataState.hidden;
            y2AxisSelect.disabled = scanDataState.hidden;
            logAxisInput.disabled = scanDataState.hidden;

            // toggle multiple slection
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
            // set the data selection.
            xAxisSelect.selectedIndex = scanDataState.x;
            for (const option of y1AxisSelect.options) {
                if (scanDataState.y1.includes(option.index)) {
                    option.selected = true;
                }
            }
            for (const option of y2AxisSelect.options) {
                if (scanDataState.y2.includes(option.index)) {
                    option.selected = true;
                }
            }
            logAxisInput.checked = scanDataState.logAxis;
        }
    }

    const messageOut: MessageFromWebview = {
        type: 'contentLoaded',
    };
    vscode.postMessage(messageOut);
});
