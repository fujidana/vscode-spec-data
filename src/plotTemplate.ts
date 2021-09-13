/* eslint-disable @typescript-eslint/naming-convention */

/**
* A Plotly.template object, wrtten in a JSON-compatible format.
* It seems the color format Plotly.js can accept is the same as that of CSS. 
*/
export default {
    "light": {
        "data": [],
        "layout": {
            "plot_bgcolor": "rgba(255, 255, 255, 0.0)",
            "paper_bgcolor": "rgba(255, 255, 255, 0.0)"
        }
    },
    "dark": {
        "data": [
            {
                "type": "scatter",
                "marker": {
                    "color": "#76BCFF"
                },
                "line": {
                    "color": "#76BCFF"
                }
            }
        ], "layout": {
            "plot_bgcolor": "#1E1E1E00",
            "paper_bgcolor": "#1E1E1E00",
            "font": {
                "color": "#F2F5FA"
            },
            "xaxis": {
                "gridcolor": "#283442",
                "linecolor": "#506784",
                "zerolinecolor": "#283442",
                "zerolinewidth": 2
            },
            "yaxis": {
                "gridcolor": "#283442",
                "linecolor": "#506784",
                "zerolinecolor": "#283442",
                "zerolinewidth": 2
            }
        }
    },
    "highContast": {
        "data": [
            {
                "type": "scatter",
                "marker": {
                    "color": "#FFF"
                },
                "line": {
                    "color": "#FFF"
                }
            }
        ], "layout": {
            "plot_bgcolor": "#0000",
            "paper_bgcolor": "#0000",
            "font": {
                "color": "#FFF"
            },
            "xaxis": {
                "gridcolor": "#800",
                "linecolor": "#080",
                "zerolinecolor": "#800",
                "zerolinewidth": 2
            },
            "yaxis": {
                "gridcolor": "#800",
                "linecolor": "#080",
                "zerolinecolor": "#800",
                "zerolinewidth": 2
            }
        }
    }
};