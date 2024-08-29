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
        const yAxisSelects = div.getElementsByClassName('yAxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const logAxisInputs = div.getElementsByClassName('logAxisInput') as HTMLCollectionOf<HTMLInputElement>;
        if (occuranceString && xAxisSelects.length === 1 && yAxisSelects.length === 1 && logAxisInputs.length === 1) {
            const occurance = parseInt(occuranceString);

            const xAxisSelect = xAxisSelects[0];
            const yAxisSelect = yAxisSelects[0];
            const logAxisInput = logAxisInputs[0];

            const xIndex = xAxisSelect.hidden ? -1 : xAxisSelect.selectedIndex;
            const yIndexes = [...yAxisSelect.selectedOptions].map(option => option.index);

            // show or hide the graph
            if (showPlotInput.checked) {
                const messageOut: MessageFromWebview = {
                    type: 'requestPlotData',
                    occurance: occurance,
                    indexes: { x: xIndex, y: yIndexes },
                    logAxis: logAxisInput.checked,
                    callback: 'newPlot'
                };
                vscode.postMessage(messageOut);
            } else {
                Plotly.purge('plotly' + occuranceString);
            }

            // enable or disable the dropdown axis selectors
            xAxisSelect.disabled = !showPlotInput.checked;
            yAxisSelect.disabled = !showPlotInput.checked;
            logAxisInput.disabled = !showPlotInput.checked;

            // save the current state
            state.scanData[occurance] = {
                x: xIndex,
                y: yIndexes,
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
        const yAxisSelects = div.getElementsByClassName('yAxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const logAxisInputs = div.getElementsByClassName('logAxisInput') as HTMLCollectionOf<HTMLInputElement>;
        if (occuranceString && showPlotInputs.length === 1 && xAxisSelects.length === 1 && yAxisSelects.length === 1 && logAxisInputs.length === 1) {
            const occurance = parseInt(occuranceString);
            const showPlotInput = showPlotInputs[0];
            const xAxisSelect = xAxisSelects[0];
            const yAxisSelect = yAxisSelects[0];
            const logAxisInput = logAxisInputs[0];

            const xIndex = xAxisSelect.hidden ? -1 : xAxisSelect.selectedIndex;
            const yIndexes = [...yAxisSelect.selectedOptions].map(option => option.index);

            // redraw the graph
            const messageOut: MessageFromWebview = {
                type: 'requestPlotData',
                occurance: occurance,
                indexes: { x: xIndex, y: yIndexes },
                logAxis: logAxisInput.checked,
                callback: 'react'
            };
            vscode.postMessage(messageOut);

            // save the current state
            state.scanData[occurance] = {
                x: xIndex,
                y: yIndexes,
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
        const yAxisSelects = div.getElementsByClassName('yAxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const plotDivs = div.getElementsByClassName('scanDataPlot') as HTMLCollectionOf<HTMLDivElement>;
        if (occuranceString && showPlotInputs.length === 1 && xAxisSelects.length === 1 && yAxisSelects.length === 1 && plotDivs.length === 1) {
            const occurance = parseInt(occuranceString);
            const showPlotInput = showPlotInputs[0];
            const xAxisSelect = xAxisSelects[0];
            const yAxisSelect = yAxisSelects[0];

            // redraw the graph
            Plotly.relayout(plotDivs[0], {
                'yaxis.type': logAxisInput.checked ? 'log' : 'linear'
            });

            const xIndex = xAxisSelect.hidden ? -1 : xAxisSelect.selectedIndex;
            const yIndexes = [...yAxisSelect.selectedOptions].map(option => option.index);

            // save the current state
            state.scanData[occurance] = {
                x: xIndex,
                y: yIndexes,
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
        const yAxisSelects = div.getElementsByClassName('yAxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const logAxisInputs = div.getElementsByClassName('logAxisInput') as HTMLCollectionOf<HTMLInputElement>;
        const plotDivs = div.getElementsByClassName('scanDataPlot') as HTMLCollectionOf<HTMLDivElement>;
        if (occuranceString && showPlotInputs.length === 1 && xAxisSelects.length === 1 && yAxisSelects.length === 1 && logAxisInputs.length === 1 && plotDivs.length === 1) {
            if (showPlotInputs[0].checked) {
                if (callback === 'newPlot') {
                    const xAxisSelect = xAxisSelects[0];
                    const yAxisSelect = yAxisSelects[0];
                    const logAxisInput = logAxisInputs[0];

                    const xIndex = xAxisSelect.hidden ? -1 : xAxisSelect.selectedIndex;
                    const yIndexes = [...yAxisSelect.selectedOptions].map(option => option.index);

                    // redraw the graph
                    const messageOut: MessageFromWebview = {
                        type: 'requestPlotData',
                        occurance: parseInt(occuranceString),
                        indexes: { x: xIndex, y: yIndexes },
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
            const data = messageIn.y.map(y_i => {
                return {
                    x: messageIn.x.array,
                    y: y_i.array,
                    type: 'scatter',
                    name: y_i.label
                };
            });
            let yLabel: string;
            if (messageIn.y.length > 2) {
                yLabel = `${messageIn.y[0].label}, ${messageIn.y[1].label}, ...`;
            } else if (messageIn.y.length === 2) {
                yLabel = `${messageIn.y[0].label}, ${messageIn.y[1].label}`;
            } else {
                yLabel = messageIn.y[0].label;
            }

            const layout = {
                template: state.template,
                height: plotHeight,
                xaxis: { title: messageIn.x.label },
                yaxis: {
                    type: messageIn.logAxis ? 'log' : 'linear',
                    title: yLabel
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
        const yAxisSelects = document.body.getElementsByClassName('yAxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        if (messageIn.flag === true) {
            [...xAxisSelects].forEach(xAxisSelect => {
                xAxisSelect.setAttribute('size', xAxisSelect.dataset.sizeForMultiple ?? '0');
            });
            [...yAxisSelects].forEach(yAxisSelect => {
                yAxisSelect.setAttribute('multiple', '');
                yAxisSelect.setAttribute('size', yAxisSelect.dataset.sizeForMultiple ?? '0');
            });
        } else if (messageIn.flag === false) {
            [...xAxisSelects].forEach(xAxisSelect => {
                xAxisSelect.removeAttribute('size');
            });
            [...yAxisSelects].forEach(yAxisSelect => {
                yAxisSelect.removeAttribute('multiple');
                yAxisSelect.removeAttribute('size');
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
        const yAxisSelects = div.getElementsByClassName('yAxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const logAxisInputs = div.getElementsByClassName('logAxisInput') as HTMLCollectionOf<HTMLInputElement>;

        if (occuranceString && showPlotInputs.length === 1 && xAxisSelects.length === 1 && yAxisSelects.length === 1 && logAxisInputs.length === 1) {
            const occurance = parseInt(occuranceString);
            const showPlotInput = showPlotInputs[0];
            const xAxisSelect = xAxisSelects[0];
            const yAxisSelect = yAxisSelects[0];
            const logAxisInput = logAxisInputs[0];
            const scanDataState = occurance in state.scanData ? state.scanData[occurance] : {
                hidden: occurance >= maximumPlots,
                x: xAxisSelect.length > 2 ? 0 : 1,
                y: [yAxisSelect.length - 1],
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
            yAxisSelect.onchange = plotAxisSelectChangeHandler;
            logAxisInput.onchange = logAxisInputChangeHander;

            // set the initial state.
            xAxisSelect.disabled = scanDataState.hidden;
            yAxisSelect.disabled = scanDataState.hidden;
            logAxisInput.disabled = scanDataState.hidden;

            // toggle multiple slection
            if (state.enableMultipleSelection) {
                xAxisSelect.setAttribute('size', xAxisSelect.dataset.sizeForMultiple ?? "0");
                yAxisSelect.setAttribute('multiple', '');
                yAxisSelect.setAttribute('size', yAxisSelect.dataset.sizeForMultiple ?? "0");
            } else {
                xAxisSelect.removeAttribute('size');
                yAxisSelect.removeAttribute('size');
            }
            // set the data selection.
            xAxisSelect.selectedIndex = scanDataState.x;
            for (const option of yAxisSelect.options) {
                if (scanDataState.y.includes(option.index)) {
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
