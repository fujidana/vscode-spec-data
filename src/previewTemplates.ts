/**
 * This file defines default template objects passed to Plotly.js graphs.
 * 
 * Users can override the appearance defined in this file using the following
 * settings:
 * - `spec-data.preview.plot.traceTemplate`
 * - `spec-data.preview.plot.layoutTemplate`
 * 
 * The values for the respective color theme keys (such as `light`) in this
 * objects are passed to Plotly.js graphs as template, unless a user defined
 * the settings above.
 * The right value of the constant definition, i.e., a string between `=` and
 * `;`, in this file is wrtten in a JSON-compatible format, which allows a 
 * user to use this part as the base of value for the setting key above.
 * 
 * Color can be defined in various ways: it seems the color format Plotly.js
 * accepts in a template is the same as that of CSS. 
 * 
 * Shorthand such as "marker.color" is not available as a key of the object.
 */

/**
 * Template of traces in Plotly.js graphs for the respective color themes.
 * 
 * The structure is the same as `spec-data.preview.plot.traceTemplate` key 
 * in setting.json.
 * See https://plotly.com/javascript/reference/scatter/ for details about 
 * parameters.
 * Trace templates are applied cyclically in case the graph contains multiple
 * traces.
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
 * The structure is the same as `spec-data.preview.plot.layoutTemplate` key 
 * in setting.json.
* See https://plotly.com/javascript/reference/layout/ for details about 
* parameters.
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
