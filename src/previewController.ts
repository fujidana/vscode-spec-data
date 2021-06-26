declare var acquireVsCodeApi: any;
// eslint-disable-next-line @typescript-eslint/naming-convention
declare var Plotly: any;

const vscode = acquireVsCodeApi();

let template: any;

const maximumPlots = document.head.dataset.maximumPlots !== undefined ? parseInt(document.head.dataset.maximumPlots) : 0;
const plotHeight = document.head.dataset.plotHeight !== undefined ? parseInt(document.head.dataset.plotHeight) : 0;

// a handler for a checkbox to control the table visibility
const showValueListInputChangeHandler = function (event: Event) {
    if (event.target && event.target instanceof HTMLInputElement) {
        const input = event.target;
        const tableId = input.dataset.tableId;
        if (tableId) {
            const table = document.getElementById(tableId);
            if (table) {
                // toggle visibility of the motor-position table
                table.hidden = !input.checked;
            }
        }
    }
};

// a handler for a checkbox to control the plot visibility
const showPlotInputChangeHandler = function (event: Event) {
    if (event.target && event.target instanceof HTMLInputElement) {
        const input = event.target;
        const occuranceString = input.dataset.occurance;
        if (occuranceString !== undefined) {
            const axisSelectX = document.getElementById('axisSelectX' + occuranceString);
            const axisSelectY = document.getElementById('axisSelectY' + occuranceString);
            if (axisSelectX && axisSelectY && axisSelectX instanceof HTMLSelectElement && axisSelectY instanceof HTMLSelectElement) {
                if (input.checked) {
                    vscode.postMessage({
                        command: 'requestPlotData',
                        occurance: parseInt(occuranceString),
                        indexes: [axisSelectX.selectedIndex, axisSelectY.selectedIndex],
                        action: 'new'
                    });
                } else {
                    Plotly.purge('plotly' + occuranceString);
                }
                const axisSelects = input.parentElement?.getElementsByClassName('axisSelect') as HTMLCollectionOf<HTMLSelectElement> | null;
                if (axisSelects) {
                    for (const select of axisSelects) {
                        select.disabled = !input.checked;
                    }
                }
            }
        }
    }
};

// a handler for a select (dropdown list) to select columns for X and Y axes.
const plotAxisSelectChangeHandler = function (event: Event) {
    if (event.target && event.target instanceof HTMLSelectElement) {
        const select = event.target;
        const occuranceString = select.dataset.occurance;
        if (occuranceString !== undefined) {
            const axisSelectX = document.getElementById('axisSelectX' + occuranceString);
            const axisSelectY = document.getElementById('axisSelectY' + occuranceString);
            if (axisSelectX && axisSelectY && axisSelectX instanceof HTMLSelectElement && axisSelectY instanceof HTMLSelectElement) {
                vscode.postMessage({
                    command: 'requestPlotData',
                    occurance: parseInt(occuranceString),
                    indexes: [axisSelectX.selectedIndex, axisSelectY.selectedIndex],
                    action: 'react'
                });
            }
        }
    }
};

// show all graph
const showAllGraphs = function () {
    for (const div of document.body.getElementsByClassName('scanDataPlot') as HTMLCollectionOf<HTMLDivElement>) {
        const occuranceString = div.dataset.occurance;
        const showPlotInput = document.getElementById('showPlotInput' + occuranceString) as HTMLInputElement | null;
        const axisSelectX = document.getElementById('axisSelectX' + occuranceString) as HTMLSelectElement | null;
        const axisSelectY = document.getElementById('axisSelectY' + occuranceString) as HTMLSelectElement | null;

        if (occuranceString !== undefined && showPlotInput && axisSelectX && axisSelectY) {
            if (showPlotInput.checked) {
                vscode.postMessage({
                    command: 'requestPlotData',
                    occurance: parseInt(occuranceString),
                    indexes: [axisSelectX.selectedIndex, axisSelectY.selectedIndex],
                    action: 'new'
                });
            }
        }
    }
};


window.addEventListener('DOMContentLoaded', event => {

    // "Show Table" checkboxes
    for (const input of document.getElementsByClassName('showValueListInput') as HTMLCollectionOf<HTMLInputElement>) {
        // register a handler.
        input.onchange = showValueListInputChangeHandler;
    }

    // set initial state and also register handlers.
    for (const scanDataDiv of document.getElementsByClassName('scanData') as HTMLCollectionOf<HTMLDivElement>) {
        const occuranceString = scanDataDiv.dataset.occurance;
        if (occuranceString) {
            const occurance = parseInt(occuranceString);

            // "Show Plot" checkboxes
            const showPlotInputs = scanDataDiv.getElementsByClassName('showPlotInput') as HTMLCollectionOf<HTMLInputElement>;
            for (const input of showPlotInputs) {
                // register a handler
                input.dataset.occurance = occuranceString;
                // select the checkbox that corresponds with a plot to be shown by default.
                input.checked = occurance < maximumPlots;
                input.onchange = showPlotInputChangeHandler;
            }

            // axis selection dropdown menu
            const axisSelects = scanDataDiv.getElementsByClassName('axisSelect') as HTMLCollectionOf<HTMLSelectElement>;
            for (const select of axisSelects) {
                select.dataset.occurance = occuranceString;
                // Register a handler
                select.onchange = plotAxisSelectChangeHandler;
                // Disable the dropdown list that corresponds with a plot to be not shown by default.
                select.disabled = !(occurance < maximumPlots);
                // Select the first and last columns from the dropdown list item for x and y axis, respectively.
                select.selectedIndex = (select.dataset.axis && select.dataset.axis === 'x') ? 0 : select.length - 1;
            }

            // At the moment the template has not been provided, and thus no commmand is sent to Plotly.
            // Only assign the occurance value in the metadata.
            const plotlyDivs = scanDataDiv.getElementsByClassName('scanDataPlot') as HTMLCollectionOf<HTMLDivElement>;
            for (const div of plotlyDivs) {
                div.dataset.occurance = occuranceString;
            }
        }
    }

    window.addEventListener('message', event => {
        const message = event.data;

        if (message.command === 'setTemplate') {
            // create template from an object (dictionary)
            template = Plotly.makeTemplate(message.template);
            vscode.setState({ template });
            if (message.action === 'new') {
                showAllGraphs();
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
                            template: template,
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
                            template: template,
                            xaxis: { title: message.labels[0] },
                            yaxis: { title: message.labels[1] },
                            margin: { t: 20, r: 20 }
                        }
                    });
                }
            }
        }
    });
    // 
    const previousState = vscode.getState();
    if (previousState) {
        template = previousState.template;
        if (template) {
            showAllGraphs();
        }
    } else {
        vscode.postMessage({
            command: 'requestTemplate',
            action: 'new'
        });
    }
});
