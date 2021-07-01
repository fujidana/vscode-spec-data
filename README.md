# __spec__ Data File Extension for Visual Studio Code

The extension enhances user experiences in browsing data files __spec__ software outputs after execution of various built-in scan commands.
The file is referred to as the _standard data file format_ in the __spec__ PDF mannual.

The default file extention of __spec__ data files is `.spec` but VS Code provides ways for a user to change the association.
Check VS Code official documents for further details.

## What's __spec__?

> __spec__ is internationally recognized as the leading software for instrument control and data acquisition in X-ray diffraction experiments.
> It is used at more than 200 synchrotrons, industrial laboratories, universities and research facilities around the globe.

_cited from [CSS - Certified Scientific Software](https://www.certif.com) homepage._

Note that the extention is not the official one developed by Certified Scientific Software.
<!-- Use [GitHub issues](https://github.com/fujidana/vscode-spec/issues) for bug reports and feature requests about the extension. -->

## Features

- __Syntax highlighting__
- __Code navigation__
  - __Listing symbols in the active editor__: the list shown in the _outline_ view in the _Explorer_ viewlet and breadcrumbs at the top of editor
- __Code folding__
- __Preview__
  - motor positions just before a scan in a table view
  - scan data depicted in a graphical and interactive graph, powered by [Plotly.js](https://plotly.com/javascript/). One can select a pair of columns to be drawn.
  - scroll sync of the editor and preview (Currently only _scroll-preview-from-editor_ functions; _scroll-editor-from-preview_ does not.)

## Requirements

Nothing.

## Extension Settings

This extention contributes configuration options, accecible from the _Settings_ editor (Win/Linux: `Ctrl+,`, Mac: `Cmd+,`).
Read [Visual Studio Code User and Workspace Settings](https://code.visualstudio.com/docs/getstarted/settings) for details about the _Settings_ window.

### Plotly.js template

The default background color of graphs depiced by Plotly.py is white, which does not match well with _dark_ or _high contrast_ color themes of VS Code.
While Plotly.py (Python version of Plotly) provides several built-in templates including `"plotly_dark"`, it seems Plotly.js (JavaScript version) does not.
Therefore, the extension developer manually wrote Plotly.js templates that are apparently in accordance with the built-in _dark_ and _high contrast_ color themes of VS Code.

One can override values in these templates using the `spec-data.preview.plot.template` configuraiton option.
The option has at most 4 keys: `"all"`, `"light"`, `"dark"`, and `"highContrast"`.
The value of the respective key shall be the JSON represenation of a Plotly.js template.
The `"all"` key is for a template that is independent from the color theme and the others for the respective themes.
Theme-depentent templates have priority over the theme-independent template.
For example, the following code in one's _setting.json_ file makes the line color green in the _light_ theme and red in the other themes (i.e., _dark_ and _high contrast_).

```json
{
    "spec-data.preview.plot.template": {
        "all": {
            "data": [
                {"type": "scatter", "line": { "color": "#FF0000" } }
            ]
        },
        "light": {
            "data": [
                {"type": "scatter", "line": { "color": "#00FF00" } }
            ]
        }
    }
}
```

One can find the definition of the built-in template objects for the respective color themes in [/src/plotTemplate.js](https://github.com/fujidana/vscode-spec-data/blob/master/src/plotTemplate.ts) in the GitHub repository.
From this, one may be able to find the name of an attribute one wants to change.
See the [Plotly.js Reference](https://plotly.com/javascript/reference/index/) for the complete list of the Plotly.js template attributes.

Please contact the developer when one finds any item that is difficult to read in _dark_ or _high contrast_ mode;
the current templates the exntention provides may not cover comprehensively.

## Known Issues

### Limitation coming from performance

VS Code provides [Webview API](https://code.visualstudio.com/api/extension-guides/webview#scripts-and-message-passing) for extension developers to implement graphically rich contents.
In other words, such contents must be built in the world of HTML/CSS/JavaScript.
This extension employs [Plotly.js](https://plotly.com/javascript/) to plot graphs within this scheme.
As a consequcense, to render a preview of a scan file that contains a large number of scan dataset cosumues both CPU and memory resources.
To avoid a performance problem, currently the maximum number of plots is set to 25; one can change the this limitation in the __Setting__ window.

### Download button in Plotly.js graph unfunctions

Plotly.js provides a download button in the mode bar, which appears at the top right corner when the cursor is on the graph. When one employs Plotly.js in a ordinally environment with a ordinally web browser, one can use the button to download a PNG file in one's donwload folder (or somewhere else). However, a webview of VS code runs in isolated contexts. Currently the developer does not know where the file is to be saved or whether the destination folder is changable.

## Release Notes

See `CHANGELOG.md`.
