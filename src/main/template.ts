/**
 * The appearance of the Plotly.js graphs can be configured via a _Template_
 * object. The _Template_ object has two optional properties, `data` and 
 * `layout`, and various settings for the appearance can be passed as values
 * for these properties. Here the extension author calls the _Data Template_
 * the value for the `data` property and the _Layout Template_ the value for
 * the `layout_` property.
 * 
 * The two constants defined in this file, `defaultDataTemplate` and 
 * `defaultLayoutTemplate` are used as the default _data template_ and
 * _layout template_  for each color theme.
 * Users can override the templates by defining their own templates in the
 * following settings:
 * 
 * - `spec-data.preview.plot.template.data`
 * - `spec-data.preview.plot.template.layout`
 * 
 * The values for the setting keys above must have structures of a 
 * _data template_ and a _layout template_ respectively,
 * Text between an equal sign (`=`) and semi-colon (`;`) in the following code
 * can be used as a JSON object for the respective setting values.
 * (This is a JavaScript file but for this purpose, the code is written in a format 
 * close to JSON, using double quotes for keys and string values, and no trailing commas.)
 * 
 * See Plotly.js's [Figure Reference](https://plotly.com/javascript/reference/index)
 * for details about available parameters.
 */

import type { Template } from 'plotly.js';

export type ColorThemeKindLabel = 'light' | 'dark' | 'highContrast' | 'highContrastLight';

/**
 * Template for the data in Plotly.js graphs.
 * 
 * The object has the name of the color theme as its key, and the _data template_
 * for the respective color theme as its value.
 * The _data template_ has data types such as `scatter`, `heatmap` and `contour`
 * as its keys and an array of _settings_ as its value.
 * The _settings_ are applied cyclically in case the graph contains multiple
 * plots.
 * See Plotly.js's [Figure Reference](https://plotly.com/javascript/reference/index)
 * for details about available parameters.
 * 
 * The `spec-data.preview.plot.template.data` key in setting.json has the same
 * structure as this object.
 */
export const defaultDataTemplate: { [key in ColorThemeKindLabel]: NonNullable<Template['data']> } = {
    "light": {},
    "dark": {},
    "highContrast": {
        "scatter": [
            { "marker": { "color": "#0ff" }, "line": { "color": "#0ff" } },
            { "marker": { "color": "#f0f" }, "line": { "color": "#f0f" } },
            { "marker": { "color": "#ff0" }, "line": { "color": "#ff0" } }
        ]
    },
    "highContrastLight": {
        "scatter": [
            { "marker": { "color": "#f00" }, "line": { "color": "#f00" } },
            { "marker": { "color": "#0f0" }, "line": { "color": "#0f0" } },
            { "marker": { "color": "#00f" }, "line": { "color": "#00f" } }
        ]
    }
};

/**
 * Template for the layout in Plotly.js graphs.
 * 
 * The object has the name of the color theme as its key, and the _layout template_
 * for the respective color theme as its value.
 * See Plotly.js's [Figure Reference](https://plotly.com/javascript/reference/index)
 * for details about available parameters.
 * 
 * The `spec-data.preview.plot.template.layout` key in setting.json has the same
 * structure as this object.
*/
export const defaultLayoutTemplate: { [key in ColorThemeKindLabel]: NonNullable<Template['layout']> } = {
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
