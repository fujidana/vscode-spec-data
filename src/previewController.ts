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

import type { MessageFromWebview, MessageToWebview, CallbackType, State, GraphParam } from './previewTypes';

const vscode = acquireVsCodeApi<State>();

const headDataset = document.head.dataset;
const maximumPlots = parseInt(headDataset.maximumPlots ?? "0");
const plotHeight = parseInt(headDataset.plotHeight ?? "100");
const hidesTableGlobal = Boolean(parseInt(headDataset.hideTable ?? "0"));

let state = vscode.getState();
if (state === undefined) {
    state = {
        template: undefined,
        tableParams: {},
        graphParams: {},
        sourceUri: headDataset.sourceUri ?? '',
        lockPreview: false,
        enableMultipleSelection: Boolean(parseInt(headDataset.enableMultipleSelection ?? "0")),
        enableRightAxis: Boolean(parseInt(headDataset.enableRightAxis ?? "0")),
        scrollPosition: [0, 0]
    };
    vscode.setState(state);
} else if (state.sourceUri !== headDataset.sourceUri) {
    state.tableParams = {};
    state.graphParams = {};
    state.sourceUri = headDataset.sourceUri ?? '';
    state.scrollPosition = [0, 0];
    vscode.setState(state);
}

let scrollsEditor = false;
let lastScrollEditorTimeStamp = 0;
let lastScrollPreviewTimeStamp = 0;

let timer1: NodeJS.Timeout | undefined;
let timer2: NodeJS.Timeout | undefined;

// a handler for a checkbox to control the table visibility
const showValueListInputChangeHandler = function (event: Event) {
    let matches: RegExpMatchArray | null;
    if (event.target && event.target instanceof HTMLInputElement && (matches = event.target.id.match(/^showValueListInput(\d+)$/)) !== null) {
        const showValueListInput = event.target;
        const index = parseInt(matches[1]);
        const valueListTable = document.getElementById(`valueListTable${index}`) as HTMLTableElement | null;
        if (valueListTable) {
            // toggle visibility of the motor-position table
            valueListTable.hidden = !showValueListInput.checked;

            // save the current state.
            state.tableParams[index] = { hidden: !showValueListInput.checked };
            vscode.setState(state);
        }
    }
};

// a handler for a checkbox to control the plot visibility
const showPlotInputChangeHandler = function (event: Event) {
    let matches: RegExpMatchArray | null;
    if (event.target && event.target instanceof HTMLInputElement && (matches = event.target.id.match(/^showPlotInput(\d+)$/)) !== null) {
        const showPlotInput = event.target;
        const index = parseInt(matches[1]);
        const xAxisSelect = document.getElementById(`xAxisSelect${index}`) as HTMLSelectElement | null;
        const y1AxisSelect = document.getElementById(`y1AxisSelect${index}`) as HTMLSelectElement | null;
        const y2AxisSelect = document.getElementById(`y2AxisSelect${index}`) as HTMLSelectElement | null;
        const y1LogInput = document.getElementById(`y1LogInput${index}`) as HTMLInputElement | null;
        const y2LogInput = document.getElementById(`y2LogInput${index}`) as HTMLInputElement | null;
        if (xAxisSelect && y1AxisSelect && y2AxisSelect && y1LogInput && y2LogInput) {
            const selections = {
                x: xAxisSelect.hidden ? -1 : xAxisSelect.selectedIndex,
                y1: [...y1AxisSelect.selectedOptions].map(option => option.index),
                y2: y2AxisSelect.hidden ? [] : [...y2AxisSelect.selectedOptions].map(option => option.index)
            };

            // show or hide the graph
            if (showPlotInput.checked) {
                const messageOut: MessageFromWebview = {
                    type: 'requestPlotData',
                    graphNumber: index,
                    selections,
                    callback: 'newPlot'
                };
                vscode.postMessage(messageOut);
            } else {
                Plotly.purge(`graphDiv${index}`);
            }

            // enable or disable the dropdown axis selectors
            xAxisSelect.disabled = !showPlotInput.checked;
            y1AxisSelect.disabled = !showPlotInput.checked;
            y2AxisSelect.disabled = !showPlotInput.checked;
            y1LogInput.disabled = !showPlotInput.checked;
            y2LogInput.disabled = !showPlotInput.checked;

            // save the current state
            state.graphParams[index] = {
                selections: selections,
                y1Log: y1LogInput.checked,
                y2Log: y2LogInput.checked,
                hidden: !showPlotInput.checked
            };
            vscode.setState(state);
        }
    }
};

// a handler for a select (dropdown list) to select columns for X and Y axes.
const plotAxisSelectChangeHandler = function (event: Event) {
    let matches: RegExpMatchArray | null;
    if (event.target && event.target instanceof HTMLSelectElement && (matches = event.target.id.match(/^(x|y1|y2)AxisSelect(\d+)$/)) !== null) {
        const index = parseInt(matches[2]);
        const xAxisSelect = document.getElementById(`xAxisSelect${index}`) as HTMLSelectElement | null;
        const y1AxisSelect = document.getElementById(`y1AxisSelect${index}`) as HTMLSelectElement | null;
        const y2AxisSelect = document.getElementById(`y2AxisSelect${index}`) as HTMLSelectElement | null;
        if (xAxisSelect && y1AxisSelect && y2AxisSelect) {
            const selections = {
                x: xAxisSelect.hidden ? -1 : xAxisSelect.selectedIndex,
                y1: [...y1AxisSelect.selectedOptions].map(option => option.index),
                y2: y2AxisSelect.hidden ? [] : [...y2AxisSelect.selectedOptions].map(option => option.index)
            };

            // redraw the graph
            const messageOut: MessageFromWebview = {
                type: 'requestPlotData',
                graphNumber: index,
                selections,
                callback: 'react'
            };
            vscode.postMessage(messageOut);

            // save the current state
            if (index in state.graphParams) {
                state.graphParams[index].selections = selections;
            } else {
                state.graphParams[index] = { selections };
            }
            vscode.setState(state);
        }
    }
};

// a handler for a checkbox to select the axis scale from log or linear.
const logAxisInputChangeHandler = function (event: Event) {
    let matches: RegExpMatchArray | null;
    if (event.target && event.target instanceof HTMLInputElement && (matches = event.target.id.match(/^(y1|y2)LogInput(\d+)$/)) !== null) {
        const logAxisInput = event.target;
        const index = parseInt(matches[2]);
        const graphDiv = document.getElementById(`graphDiv${index}`) as HTMLDivElement | null;
        if (graphDiv) {
            let layout: any; // Partial<Plotly.Layout>;
            let newGraphParam: Partial<GraphParam>;
            const axisTypeValue = logAxisInput.checked ? 'log' : 'linear';
            if (matches[1] === 'y2') {
                layout = { 'yaxis2.type': axisTypeValue };
                newGraphParam = { y2Log: logAxisInput.checked };
            } else {
                layout = { 'yaxis.type': axisTypeValue };
                newGraphParam = { y1Log: logAxisInput.checked };
            }

            Plotly.relayout(graphDiv, layout);
            state.graphParams[index] = index in state.graphParams ? { ...state.graphParams[index], ...newGraphParam } : newGraphParam;
            vscode.setState(state);
        }
    }
};

// show all graphs
const showAllGraphs = (callback: CallbackType) => {
    const scanDataDivs = document.body.getElementsByClassName('scanData') as HTMLCollectionOf<HTMLDivElement>;
    for (let index = 0; index < scanDataDivs.length; index++) {
        const div = scanDataDivs[index];
        const showPlotInputs = div.getElementsByClassName('showPlotInput') as HTMLCollectionOf<HTMLInputElement>;
        const xAxisSelects = div.getElementsByClassName('xAxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const y1AxisSelects = div.getElementsByClassName('y1AxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const y2AxisSelects = div.getElementsByClassName('y2AxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const graphDivs = div.getElementsByClassName('graphDiv') as HTMLCollectionOf<HTMLDivElement>;
        if ([showPlotInputs, xAxisSelects, y1AxisSelects, y2AxisSelects, graphDivs].every(element => element.length === 1)) {
            if (showPlotInputs[0].checked) {
                if (callback === 'newPlot') {
                    const xAxisSelect = xAxisSelects[0];
                    const y1AxisSelect = y1AxisSelects[0];
                    const y2AxisSelect = y2AxisSelects[0];

                    const selections = {
                        x: xAxisSelect.hidden ? -1 : xAxisSelect.selectedIndex,
                        y1: [...y1AxisSelect.selectedOptions].map(option => option.index),
                        y2: y2AxisSelect.hidden ? [] : [...y2AxisSelect.selectedOptions].map(option => option.index)
                    };

                    // redraw the graph
                    const messageOut: MessageFromWebview = {
                        type: 'requestPlotData',
                        graphNumber: index,
                        selections,
                        callback
                    };
                    vscode.postMessage(messageOut);
                } else if (callback === 'relayout') {
                    Plotly.relayout(graphDivs[0], {
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
            element.scrollIntoView({ block: 'start' });
            lastScrollPreviewTimeStamp = event.timeStamp;
        }
    } else if (messageIn.type === 'updatePlot') {
        const graphDiv = document.getElementById(`graphDiv${messageIn.graphNumber}`);
        const y1LogInput = document.getElementById(`y1LogInput${messageIn.graphNumber}`) as HTMLInputElement | null;
        const y2LogInput = document.getElementById(`y2LogInput${messageIn.graphNumber}`) as HTMLInputElement | null;
        if (graphDiv && y1LogInput && y2LogInput) {
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
            const data = y1Data.concat(y2Data);

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
            const layout: Partial<Plotly.Layout> = {
                template: state.template,
                height: plotHeight,
                xaxis: { title: { text: messageIn.x.label } },
                yaxis: {
                    title: { text: getAxisLabel(messageIn.y1) },
                    type: y1LogInput.checked ? 'log' : 'linear'
                },
                yaxis2: {
                    title: { text: getAxisLabel(messageIn.y2) },
                    type: y2LogInput.checked ? 'log' : 'linear',
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
        const y1AxisSelects = document.body.getElementsByClassName('y1AxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
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
            // const delay = 0 + 50 * Object.entries(state.graphParams).filter(([occurance, graphParam]) => {
            //     return !(graphParam?.hidden ?? Number(occurance) >= maximumPlots);
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
    // Initialize prescan position elements
    const valueListDivs = document.body.getElementsByClassName('valueList') as HTMLCollectionOf<HTMLDivElement>;
    for (let index = 0; index < valueListDivs.length; index++) {
        const div = valueListDivs[index];
        const showValueListInputs = div.getElementsByClassName('showValueListInput') as HTMLCollectionOf<HTMLInputElement>;
        const valueListTables = div.getElementsByClassName('valueListTable') as HTMLCollectionOf<HTMLTableElement>;

        if (showValueListInputs.length === 1 && valueListTables.length === 1) {
            showValueListInputs[0].setAttribute('id', `showValueListInput${index}`);
            valueListTables[0].setAttribute('id', `valueListTable${index}`);

            const hidesTable = state.tableParams[index]?.hidden ?? hidesTableGlobal;
            // const hidesTable: boolean = index in state.tableParams && state.tableParams[index].hidden !== undefined ? state.tableParams[index].hidden : hidesTableGlobal;

            // set the initial state
            showValueListInputs[0].checked = !hidesTable;
            valueListTables[0].hidden = hidesTable;

            // register a handler.
            showValueListInputs[0].onchange = showValueListInputChangeHandler;
        }
    }

    // Initialize scan data elements
    const scanDataDivs = document.body.getElementsByClassName('scanData') as HTMLCollectionOf<HTMLDivElement>;
    for (let index = 0; index < scanDataDivs.length; index++) {
        const div = scanDataDivs[index];
        const showPlotInputs = div.getElementsByClassName('showPlotInput') as HTMLCollectionOf<HTMLInputElement>;
        const xAxisSelects = div.getElementsByClassName('xAxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const y1AxisSelects = div.getElementsByClassName('y1AxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const y2AxisSelects = div.getElementsByClassName('y2AxisSelect') as HTMLCollectionOf<HTMLSelectElement>;
        const y1LogInputs = div.getElementsByClassName('y1LogInput') as HTMLCollectionOf<HTMLInputElement>;
        const y2LogInputs = div.getElementsByClassName('y2LogInput') as HTMLCollectionOf<HTMLInputElement>;
        const graphDivs = div.getElementsByClassName('graphDiv') as HTMLCollectionOf<HTMLDivElement>;

        if ([showPlotInputs, xAxisSelects, y1AxisSelects, y2AxisSelects, y1LogInputs, y2LogInputs, graphDivs].every(element => element.length === 1)) {
            const showPlotInput = showPlotInputs[0];
            const xAxisSelect = xAxisSelects[0];
            const y1AxisSelect = y1AxisSelects[0];
            const y2AxisSelect = y2AxisSelects[0];
            const y1LogInput = y1LogInputs[0];
            const y2LogInput = y2LogInputs[0];
            const graphDiv = graphDivs[0];

            showPlotInput.setAttribute('id', `showPlotInput${index}`);
            xAxisSelect.setAttribute('id', `xAxisSelect${index}`);
            y1AxisSelect.setAttribute('id', `y1AxisSelect${index}`);
            y2AxisSelect.setAttribute('id', `y2AxisSelect${index}`);
            y1LogInput.setAttribute('id', `y1LogInput${index}`);
            y2LogInput.setAttribute('id', `y2LogInput${index}`);
            graphDiv.setAttribute('id', `graphDiv${index}`);

            // Show Plot checkboxes
            // set the initial state.
            const hidesPlot = state.graphParams[index]?.hidden ?? index >= maximumPlots;
            // const hidesPlot: boolean = index in state.graphParams && state.graphParams[index].hidden !== undefined ? state.graphParams[index].hidden : index >= maximumPlots;
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
            // xAxisSelect.selectedIndex = state.graphParams[index]?.xIndex ?? 0;
            xAxisSelect.selectedIndex = state.graphParams[index]?.selections?.x ?? (xAxisSelect.length > 2 ? 0 : 1);

            const y1Indexes = state.graphParams[index]?.selections?.y1 ?? [y1AxisSelect.length - 1];
            // y1Indexes.forEach(i => y1AxisSelect.options[i].selected = true);
            [...y1AxisSelect.options].forEach(option => { option.selected = y1Indexes.includes(option.index); });

            const y2Indexes = state.graphParams[index]?.selections?.y2 ?? [y2AxisSelect.length - 1];
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

            y1LogInput.checked = state.graphParams[index]?.y1Log ?? false;
            y2LogInput.checked = state.graphParams[index]?.y2Log ?? false;

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
});


// It is enough to store scroll position only when the page is being closed.
// However, Safari does not support 'scrollend' or `beforeunload` event.
// Considering the case that Visual Studio Code for the Web is used on Safari, 
// the scroll position is also stored in "scroll" event.
window.addEventListener('scrollend', _event => {
    state.scrollPosition = [window.scrollX, window.scrollY];
    vscode.setState(state);
});

window.addEventListener("scroll", event => {
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