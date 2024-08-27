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

import type { MessageFromWebview, MessageToWebview, ActionType, State } from "./previewTypes";
// type MessageFromWebview = any;
// type MessageToWebview = any;
// type ActionType = any;
// type State = any;

const vscode = acquireVsCodeApi<State>();

const headDataset = document.head.dataset;
const maximumPlots = headDataset.maximumPlots !== undefined ? parseInt(headDataset.maximumPlots) : 0;
const plotHeight = headDataset.plotHeight !== undefined ? parseInt(headDataset.plotHeight) : 0;
const hideTableGlobal = headDataset.hideTable !== undefined ? Boolean(parseInt(headDataset.hideTable)) : false;
const sourceUri = headDataset.sourceUri !== undefined ? headDataset.sourceUri : '';

let state0 = vscode.getState();
if (state0 === undefined || state0.sourceUri !== sourceUri) {
    state0 = { template: undefined, valueList: {}, scanData: {}, sourceUri: sourceUri, lockPreview: false };
    vscode.setState(state0);
}
const state = state0;

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
        const axisSelects = div.getElementsByClassName('axisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const logAxisInputs = div.getElementsByClassName('logAxisInput') as HTMLCollectionOf<HTMLInputElement>;
        if (occuranceString && axisSelects.length === 2 && logAxisInputs.length === 1) {
            const occurance = parseInt(occuranceString);

            // show or hide the graph
            if (showPlotInput.checked) {
                const messageOut: MessageFromWebview = {
                    type: 'requestPlotData',
                    occurance: occurance,
                    indexes: [
                        axisSelects[0].hidden ? -1 : axisSelects[0].selectedIndex,
                        axisSelects[1].selectedIndex
                    ],
                    logAxis: logAxisInputs[0].checked,
                    action: 'new'
                };
                vscode.postMessage(messageOut);
            } else {
                Plotly.purge('plotly' + occuranceString);
            }

            // enable or disable the dropdown axis selectors
            for (const axisSelect of axisSelects) {
                axisSelect.disabled = !showPlotInput.checked;
            }
            logAxisInputs[0].disabled = !showPlotInput.checked;

            // save the current state
            state.scanData[occurance] = {
                x: axisSelects[0].hidden ? -1 : axisSelects[0].selectedIndex,
                y: axisSelects[1].selectedIndex,
                hidden: !showPlotInput.checked,
                logAxis: logAxisInputs[0].checked
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
        const axisSelects = div.getElementsByClassName('axisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const logAxisInputs = div.getElementsByClassName('logAxisInput') as HTMLCollectionOf<HTMLInputElement>;
        if (occuranceString && showPlotInputs.length === 1 && axisSelects.length === 2 && logAxisInputs.length === 1) {
            const occurance = parseInt(occuranceString);

            // redraw the graph
            const messageOut: MessageFromWebview = {
                type: 'requestPlotData',
                occurance: occurance,
                indexes: [
                    axisSelects[0].hidden ? -1 : axisSelects[0].selectedIndex,
                    axisSelects[1].selectedIndex
                ],
                logAxis: logAxisInputs[0].checked,
                action: 'react'
            };
            vscode.postMessage(messageOut);

            // save the current state
            state.scanData[occurance] = {
                x: axisSelects[0].hidden ? -1 : axisSelects[0].selectedIndex,
                y: axisSelects[1].selectedIndex,
                hidden: !showPlotInputs[0].checked,
                logAxis: logAxisInputs[0].checked
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
        const axisSelects = div.getElementsByClassName('axisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const plotDivs = div.getElementsByClassName('scanDataPlot') as HTMLCollectionOf<HTMLDivElement>;
        if (occuranceString && showPlotInputs.length === 1 && axisSelects.length === 2 && plotDivs.length === 1) {
            const occurance = parseInt(occuranceString);

            // redraw the graph
            Plotly.relayout(plotDivs[0], {
                'yaxis.type': logAxisInput.checked ? 'log' : 'linear'
            });

            // save the current state
            state.scanData[occurance] = {
                x: axisSelects[0].hidden ? -1 : axisSelects[0].selectedIndex,
                y: axisSelects[1].selectedIndex,
                hidden: !showPlotInputs[0].checked,
                logAxis: logAxisInput.checked
            };
            vscode.setState(state);
        }
    }
};

// show all graphs
const showAllGraphs = (action: ActionType) => {
    for (const div of document.body.getElementsByClassName('scanData') as HTMLCollectionOf<HTMLDivElement>) {
        const occuranceString = div.dataset.occurance;
        const showPlotInputs = div.getElementsByClassName('showPlotInput') as HTMLCollectionOf<HTMLInputElement>;
        const axisSelects = div.getElementsByClassName('axisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const logAxisInputs = div.getElementsByClassName('logAxisInput') as HTMLCollectionOf<HTMLInputElement>;
        const plotDivs = div.getElementsByClassName('scanDataPlot') as HTMLCollectionOf<HTMLDivElement>;
        if (occuranceString && showPlotInputs && axisSelects && logAxisInputs && plotDivs && showPlotInputs.length === 1 && axisSelects.length === 2 && logAxisInputs.length === 1 && plotDivs.length === 1) {
            if (showPlotInputs[0].checked) {
                if (action === 'new') {
                    const messageOut: MessageFromWebview = {
                        type: 'requestPlotData',
                        occurance: parseInt(occuranceString),
                        indexes: [
                            axisSelects[0].hidden ? -1 : axisSelects[0].selectedIndex,
                            axisSelects[1].selectedIndex
                        ],
                        logAxis: logAxisInputs[0].checked,
                        action: action
                    };
                    vscode.postMessage(messageOut);
                } else if (action === 'update') {
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
        if (messageIn.action) {
            showAllGraphs(messageIn.action);
        }
    } else if (messageIn.type === 'scrollToElement') {
        const element = document.getElementById(messageIn.elementId);
        if (element) {
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    } else if (messageIn.type === 'updatePlot') {
        const element = document.getElementById(messageIn.elementId);
        if (element) {
            const layout = {
                template: state.template,
                height: plotHeight,
                xaxis: { title: messageIn.labels[0] },
                yaxis: {
                    type: messageIn.logAxis ? 'log' : 'linear',
                    title: messageIn.labels[1]
                },
                margin: { t: 20, r: 20 }
            };

            if (messageIn.action === 'new') {
                element.hidden = false;
                Plotly.newPlot(element, messageIn.data, layout, { responsive: true });
            } else if (messageIn.action === 'react') {
                Plotly.react(element, messageIn.data, layout);
            }
        }
    } else if (messageIn.type === 'lockPreview') {
        state.lockPreview = messageIn.flag;
        vscode.setState(state);
    }
});

window.addEventListener('DOMContentLoaded', event => {
    // Initialize prescan position elements
    for (const div of document.getElementsByClassName('valueList') as HTMLCollectionOf<HTMLDivElement>) {
        const occuranceString = div.dataset.occurance;
        const showValueListInputs = div.getElementsByClassName('showValueListInput') as HTMLCollectionOf<HTMLInputElement>;
        const valueListTables = div.getElementsByClassName('valueListTable') as HTMLCollectionOf<HTMLTableElement>;

        if (occuranceString && showValueListInputs && valueListTables && showValueListInputs.length === 1 && valueListTables.length === 1) {
            const occurance = parseInt(occuranceString);
            const hideTable: boolean = state.valueList[occurance] && state.valueList[occurance].hidden !== undefined ? state.valueList[occurance].hidden : hideTableGlobal;

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
        const axisSelects = div.getElementsByClassName('axisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const logAxisInputs = div.getElementsByClassName('logAxisInput') as HTMLCollectionOf<HTMLInputElement>;

        if (occuranceString && showPlotInputs && axisSelects && logAxisInputs && showPlotInputs.length === 1 && axisSelects.length === 2 && logAxisInputs.length === 1) {
            const occurance = parseInt(occuranceString);
            const scanDataState = occurance in state.scanData ? state.scanData[occurance] : {
                hidden: occurance >= maximumPlots,
                x: axisSelects[0].length > 2 ? 0 : 1,
                y: axisSelects[1].length - 1,
                logAxis: false
            };

            // Show Plot checkboxes
            // register a handler
            showPlotInputs[0].onchange = showPlotInputChangeHandler;

            // set the initial state.
            showPlotInputs[0].checked = !(scanDataState.hidden);

            // Axis selectors
            // register a handler
            axisSelects[0].onchange = plotAxisSelectChangeHandler;
            axisSelects[1].onchange = plotAxisSelectChangeHandler;
            logAxisInputs[0].onchange = logAxisInputChangeHander;

            // set the initial state.
            axisSelects[0].disabled = scanDataState.hidden;
            axisSelects[1].disabled = scanDataState.hidden;
            logAxisInputs[0].disabled = scanDataState.hidden;

            axisSelects[0].selectedIndex = scanDataState.x;
            axisSelects[1].selectedIndex = scanDataState.y;
            logAxisInputs[0].checked = scanDataState.logAxis;
        }
    }

    const messageOut: MessageFromWebview = {
        type: 'contentLoaded',
    };
    vscode.postMessage(messageOut);
});
