declare var acquireVsCodeApi: any;
// eslint-disable-next-line @typescript-eslint/naming-convention
declare var Plotly: any;

interface ValueListState { [occurance: number]: { hidden: boolean } }
interface ScanDataState { [occurance: number]: { x: number, y: number, hidden: boolean } }
interface State { template: any, valueList: ValueListState, scanData: ScanDataState, sourceUri: string, lockPreview: boolean }

const vscode = acquireVsCodeApi();

const headDataset = document.head.dataset;
const maximumPlots = headDataset.maximumPlots !== undefined ? parseInt(headDataset.maximumPlots) : 0;
const plotHeight = headDataset.plotHeight !== undefined ? parseInt(headDataset.plotHeight) : 0;
const hideTableGlobal = headDataset.hideTable !== undefined ? Boolean(parseInt(headDataset.hideTable)) : false;
const sourceUri = headDataset.sourceUri !== undefined ? headDataset.sourceUri : "";

let state: State = vscode.getState();
if (state === undefined || state.sourceUri !== sourceUri) {
    state = { template: undefined, valueList: {}, scanData: {}, sourceUri: sourceUri, lockPreview: false };
    vscode.setState(state);
}

// a handler for a checkbox to control the table visibility
const showValueListInputChangeHandler = function (event: Event) {
    if (event.target && event.target instanceof HTMLInputElement && event.target.parentElement?.parentElement) {
        const input = event.target;
        const div = event.target.parentElement.parentElement;
        const occuranceString = div.dataset.occurance;
        const tables = div.getElementsByClassName('valueListTable') as HTMLCollectionOf<HTMLTableElement>;
        if (occuranceString && tables && tables.length === 1) {
            // toggle visibility of the motor-position table
            tables[0].hidden = !input.checked;

            // save the current state.
            state.valueList[parseInt(occuranceString)] = { hidden: !input.checked };
            vscode.setState(state);
        }
    }
};

// a handler for a checkbox to control the plot visibility
const showPlotInputChangeHandler = function (event: Event) {
    if (event.target && event.target instanceof HTMLInputElement && event.target.parentElement?.parentElement) {
        const input = event.target;
        const div = event.target.parentElement.parentElement;
        const occuranceString = div.dataset.occurance;
        const selects = div.getElementsByClassName('axisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        if (occuranceString && selects && selects.length === 2) {
            // show or hide the graph
            if (input.checked) {
                vscode.postMessage({
                    command: 'requestPlotData',
                    occurance: parseInt(occuranceString),
                    indexes: [selects[0].selectedIndex, selects[1].selectedIndex],
                    action: 'new'
                });
            } else {
                Plotly.purge('plotly' + occuranceString);
            }

            // enable or disable the dropdown axis selectors
            selects[0].disabled = !input.checked;
            selects[1].disabled = !input.checked;

            // save the current state
            state.scanData[parseInt(occuranceString)] = { x: selects[0].selectedIndex, y: selects[1].selectedIndex, hidden: !input.checked };
            vscode.setState(state);
        }
    }
};

// a handler for a select (dropdown list) to select columns for X and Y axes.
const plotAxisSelectChangeHandler = function (event: Event) {
    if (event.target && event.target instanceof HTMLSelectElement && event.target.parentElement?.parentElement) {
        const div = event.target.parentElement.parentElement;
        const selects = div.getElementsByClassName('axisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const inputs = div.getElementsByClassName('showPlotInput') as HTMLCollectionOf<HTMLInputElement>;
        const occuranceString = div.dataset.occurance;
        if (occuranceString && inputs && selects && inputs.length === 1 && selects.length === 2) {
            const occurance = parseInt(occuranceString);
            // redraw the graph
            vscode.postMessage({
                command: 'requestPlotData',
                occurance: occurance,
                indexes: [selects[0].selectedIndex, selects[1].selectedIndex],
                action: 'react'
            });

            // save the current state
            state.scanData[occurance] = { x: selects[0].selectedIndex, y: selects[1].selectedIndex, hidden: !inputs[0].checked };
            vscode.setState(state);
        }
    }
};

// show all graphs
const showAllGraphs = (action: string) => {
    for (const div of document.body.getElementsByClassName('scanData') as HTMLCollectionOf<HTMLDivElement>) {
        const selects = div.getElementsByClassName('axisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const inputs = div.getElementsByClassName('showPlotInput') as HTMLCollectionOf<HTMLInputElement>;
        const plotDivs = div.getElementsByClassName('scanDataPlot') as HTMLCollectionOf<HTMLDivElement>;
        const occuranceString = div.dataset.occurance;
        if (occuranceString && inputs && selects && plotDivs && inputs.length === 1 && selects.length === 2 && plotDivs.length === 1) {
            if (inputs[0].checked) {
                if (action === 'new') {
                    vscode.postMessage({
                        command: 'requestPlotData',
                        occurance: parseInt(occuranceString),
                        indexes: [selects[0].selectedIndex, selects[1].selectedIndex],
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
        // create template from an object (dictionary)
        // template = Plotly.makeTemplate(message.template);
        state.template = message.template;
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
                        yaxis: { title: message.labels[1] },
                        margin: { t: 20, r: 20 }
                    },
                    { responsive: true }
                );
            } else if (message.action === 'react') {
                Plotly.react(element, {
                    data: message.data,
                    layout: {
                        template: state.template,
                        xaxis: { title: message.labels[0] },
                        yaxis: { title: message.labels[1] },
                        margin: { t: 20, r: 20 }
                    }
                });
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
        const inputs = div.getElementsByClassName('showValueListInput') as HTMLCollectionOf<HTMLInputElement>;
        const tables = div.getElementsByClassName('valueListTable') as HTMLCollectionOf<HTMLTableElement>;
        const occuranceString = div.dataset.occurance;

        if (occuranceString && inputs && tables && inputs.length === 1 && tables.length === 1) {
            const occurance = parseInt(occuranceString);
            const hideTable: boolean = state.valueList[occurance] && state.valueList[occurance].hidden !== undefined ? state.valueList[occurance].hidden : hideTableGlobal;

            // register a handler.
            inputs[0].onchange = showValueListInputChangeHandler;

            // set the initial state
            inputs[0].checked = !hideTable;
            tables[0].hidden = hideTable;
        }
    }

    // Initialize scan data elements
    for (const div of document.getElementsByClassName('scanData') as HTMLCollectionOf<HTMLDivElement>) {
        const occuranceString = div.dataset.occurance;
        const inputs = div.getElementsByClassName('showPlotInput') as HTMLCollectionOf<HTMLInputElement>;
        const selects = div.getElementsByClassName('axisSelect') as HTMLCollectionOf<HTMLSelectElement>;

        if (occuranceString && inputs && selects && inputs.length === 1 && selects.length === 2) {
            const occurance = parseInt(occuranceString);
            let hideGraph: boolean;
            let indexX: number;
            let indexY: number;
            if (state.scanData[occurance]) {
                hideGraph = state.scanData[occurance].hidden;
                indexX = state.scanData[occurance].x;
                indexY = state.scanData[occurance].y;
            } else {
                hideGraph = occurance >= maximumPlots;
                indexX = 0;
                indexY = selects[1].length - 1;
            }

            // "Show Plot" checkboxes
            // register a handler
            inputs[0].onchange = showPlotInputChangeHandler;

            // set the initial state.
            inputs[0].checked = !hideGraph;

            // Axis selectors
            // register a handler
            selects[0].onchange = plotAxisSelectChangeHandler;
            selects[1].onchange = plotAxisSelectChangeHandler;
            // set the initial state.
            selects[0].disabled = hideGraph;
            selects[1].disabled = hideGraph;

            selects[0].selectedIndex = indexX;
            selects[1].selectedIndex = indexY;
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
