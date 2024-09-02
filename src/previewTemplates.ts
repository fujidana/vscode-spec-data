/**
* Template of traces in Plotly.js graphs for the respective color themes.
* 
* The right value of the assignment, i.e., a string between `=` and `;`, is
* wrtten in a JSON-compatible format. The extension allows a user to override
* the template via `spec-data.preview.plot.traceTemplate` key in setting.json
* and a user can use the following JSON-compatible part as a base of the setting.
* one specified in settings.json.
* See https://plotly.com/javascript/reference/scatter/ for details about 
* parameters.
* It seems the color format Plotly.js can accept is the same as that of CSS. 
* Shorthand such as "marker.color" is not available as a key of the object.
* Trace templates are applied cyclically.
*/
export const defaultTraceTemplate = {
    "light": [
    ],
    "dark": [
    ],
    "highContrast": [
        { "marker": { "color": "#0ff" }, "line": { "color": "#0ff" } },
        { "marker": { "color": "#f0f" }, "line": { "color": "#f0f" } },
        { "marker": { "color": "#ff0" }, "line": { "color": "#ff0" } }
    ],
    "highContrastLight": [
        { "marker": { "color": "#f00" }, "line": { "color": "#f00" } },
        { "marker": { "color": "#0f0" }, "line": { "color": "#0f0" } },
        { "marker": { "color": "#00f" }, "line": { "color": "#00f" } }
    ]
};

/**
* Template of the layout in Plotly.js graphs for the respective color themes.
* 
* The right value of the assignment, i.e., a string between `=` and `;`, is
* wrtten in a JSON-compatible format. The extension allows a user to override
* the template via `spec-data.preview.plot.layoutTemplate` key in setting.json
* and a user can use the following JSON-compatible part as a base of the setting.
* See https://plotly.com/javascript/reference/layout/ for details about 
* parameters.
* It seems the color format Plotly.js can accept is the same as that of CSS. 
* Shorthand such as "font.color" is not available as a key of the object.
*/
export const defaultLayoutTemplate = {
    "light": {
        "plot_bgcolor": "rgba(255, 255, 255, 0.0)",
        "paper_bgcolor": "rgba(255, 255, 255, 0.0)"
    },
    "dark": {
        "plot_bgcolor": "#1E1E1E00",
        "paper_bgcolor": "#1E1E1E00",
        "font": {
            "color": "#F2F5FA"
        },
        "xaxis": {
            "gridcolor": "#283442",
            "linecolor": "#506784",
            "zerolinecolor": "#283442"
        },
        "yaxis": {
            "gridcolor": "#283442",
            "linecolor": "#506784",
            "zerolinecolor": "#283442"
        }
    },
    "highContrast": {
        "plot_bgcolor": "#0000",
        "paper_bgcolor": "#0000",
        "font": {
            "color": "#FFF"
        },
        "xaxis": {
            "gridcolor": "#444",
            "linecolor": "#888",
            "zerolinecolor": "#888",
            "zerolinewidth": 2
        },
        "yaxis": {
            "gridcolor": "#444",
            "linecolor": "#888",
            "zerolinecolor": "#888",
            "zerolinewidth": 2
        }
    },
    "highContrastLight": {
        "plot_bgcolor": "#FFF0",
        "paper_bgcolor": "#FFF0",
        "font": {
            "color": "#000"
        },
        "xaxis": {
            "gridcolor": "#bbb",
            "linecolor": "#888",
            "zerolinecolor": "#888",
            "zerolinewidth": 2
        },
        "yaxis": {
            "gridcolor": "#bbb",
            "linecolor": "#888",
            "zerolinecolor": "#888",
            "zerolinewidth": 2
        }
    }
};
