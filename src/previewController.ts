// eslint-disable-next-line @typescript-eslint/naming-convention
declare var Plotly: any;

interface ValueListState { [occurance: number]: { hidden: boolean } }
interface ScanDataState { [occurance: number]: { x: number, y: number, hidden: boolean, logAxis: boolean } }
interface State { template: any, valueList: ValueListState, scanData: ScanDataState, sourceUri: string, lockPreview: boolean }

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
                vscode.postMessage({
                    command: 'requestPlotData',
                    occurance: occurance,
                    indexes: [axisSelects[0].selectedIndex, axisSelects[1].selectedIndex],
                    logAxis: logAxisInputs[0].checked,
                    action: 'new'
                });
            } else {
                Plotly.purge('plotly' + occuranceString);
            }

            // enable or disable the dropdown axis selectors
            axisSelects[0].disabled = !showPlotInput.checked;
            axisSelects[1].disabled = !showPlotInput.checked;
            logAxisInputs[0].disabled = !showPlotInput.checked;

            // save the current state
            state.scanData[occurance] = {
                x: axisSelects[0].selectedIndex,
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
            vscode.postMessage({
                command: 'requestPlotData',
                occurance: occurance,
                indexes: [axisSelects[0].selectedIndex, axisSelects[1].selectedIndex],
                logAxis: logAxisInputs[0].checked,
                action: 'react'
            });

            // save the current state
            state.scanData[occurance] = {
                x: axisSelects[0].selectedIndex,
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
                x: axisSelects[0].selectedIndex,
                y: axisSelects[1].selectedIndex,
                hidden: !showPlotInputs[0].checked,
                logAxis: logAxisInput.checked
            };
            vscode.setState(state);
        }
    }
};



// show all graphs
const showAllGraphs = (action: string) => {
    for (const div of document.body.getElementsByClassName('scanData') as HTMLCollectionOf<HTMLDivElement>) {
        const occuranceString = div.dataset.occurance;
        const showPlotInputs = div.getElementsByClassName('showPlotInput') as HTMLCollectionOf<HTMLInputElement>;
        const axisSelects = div.getElementsByClassName('axisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const logAxisInputs = div.getElementsByClassName('logAxisInput') as HTMLCollectionOf<HTMLInputElement>;
        const plotDivs = div.getElementsByClassName('scanDataPlot') as HTMLCollectionOf<HTMLDivElement>;
        if (occuranceString && showPlotInputs && axisSelects && logAxisInputs && plotDivs && showPlotInputs.length === 1 && axisSelects.length === 2 && logAxisInputs.length === 1 && plotDivs.length === 1) {
            if (showPlotInputs[0].checked) {
                if (action === 'new') {
                    vscode.postMessage({
                        command: 'requestPlotData',
                        occurance: parseInt(occuranceString),
                        indexes: [axisSelects[0].selectedIndex, axisSelects[1].selectedIndex],
                        logAxis: logAxisInputs[0].checked,
                        action: action
                    });
                } else if (action === 'update') {
                    Plotly.relayout(plotDivs[0], {
                        template: state.template
                    });
                }
            }
        }
    }
};

window.addEventListener('message', event => {
    const message = event.data;

    if (message.command === 'setTemplate') {
        state.template = Plotly.makeTemplate(message.template);
        vscode.setState(state);
        if (message.action) {
            showAllGraphs(message.action);
        }
    } else if (message.command === 'scrollToElement') {
        const element = document.getElementById(message.elementId);
        if (element) {
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    } else if (message.command === 'updatePlot') {
        const element = document.getElementById(message.elementId);
        if (element) {
            if (message.action === 'new') {
                element.hidden = false;
                Plotly.newPlot(element,
                    message.data,
                    {
                        template: state.template,
                        height: plotHeight,
                        xaxis: { title: message.labels[0] },
                        yaxis: {
                            type: message.logAxis ? 'log' : 'linear',
                            title: message.labels[1]
                        },
                        margin: { t: 20, r: 20 }
                    },
                    { responsive: true }
                );
            } else if (message.action === 'react') {
                Plotly.react(element,
                    message.data,
                    {
                        template: state.template,
                        xaxis: { title: message.labels[0] },
                        yaxis: {
                            type: message.logAxis ? 'log' : 'linear',
                            title: message.labels[1]
                        },
                        margin: { t: 20, r: 20 }
                    }
                );
            }
        }
    } else if (message.command === 'lockPreview') {
        state.lockPreview = message.flag;
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
                x: 0,
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


    if (state.template === undefined) {
        vscode.postMessage({
            command: 'requestTemplate',
            action: 'new'
        });
    } else {
        showAllGraphs('new');
    }
});
