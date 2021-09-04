# __spec__ Data File Extension for Visual Studio Code

The extension enhances user experiences in browsing __spec__ data files with Visual Studio Code.
__spec__ data files referred to here are files the __spec__ software outputs during various scan commands; they are referred to as the _standard data file format_ in the __spec__ PDF mannual.

__spec__ does not specify the filename extension for this data format.
While this VS Code extension treats `.spec` as the default file extension for the files (language identifier: `spec-data`), users can change the association by themselves.
Read [Language Support in Visual Studio Code](https://code.visualstudio.com/docs/languages/overview) (official document of VS Code) for further details.

The extension additionally supports chiplot file format, in which __fit2d__ software imports and exports one-dimensional dataset such as scattering profiles (language identifier: `chiplot`, default extension: `.chi`).

## What's __spec__?

> __spec__ is internationally recognized as the leading software for instrument control and data acquisition in X-ray diffraction experiments.
> It is used at more than 200 synchrotrons, industrial laboratories, universities and research facilities around the globe.

_cited from [CSS - Certified Scientific Software](https://www.certif.com) homepage._

Note that the extension is not the official one developed by Certified Scientific Software.
Use [GitHub issues](https://github.com/fujidana/vscode-spec-data/issues) for bug reports and feature requests about the extension.

## Features

- __Syntax highlighting__ (only for `spec-data`)
- __Code navigation__ (only for `spec-data`)
  - __Listing symbols in the active editor__: the list shown in the _outline_ view in the _Explorer_ viewlet and breadcrumbs at the top of the editor view
- __Code folding__ (only for `spec-data`)
- __Preview__
  - motor positions just before a scan in a table view (only for `spec-data`)
  - scan data depicted in a graphical and interactive graph, powered by [Plotly.js](https://plotly.com/javascript/). Users can select a pair of columns to be drawn.
  - scroll sync of the editor and preview (Currently only _scroll-preview-from-editor_ functions; _scroll-editor-from-preview_ does not.)

![screenshot](resources/screenshot.png)

## Requirements

Nothing.

## Extension Settings

This extension contributes configuration options, accecible from the _Settings_ editor (Win/Linux: `Ctrl+,`, Mac: `Cmd+,`).
Read [Visual Studio Code User and Workspace Settings](https://code.visualstudio.com/docs/getstarted/settings) for details about the _Settings_ window.

### Plotly.js template

The extension internally provides Plotly.js templates that are apparently in accordance with the built-in _dark_ and _high contrast_ color themes of VS Code.
Users can override these templates via the `spec-data.preview.plot.template` configuraiton option.

The option may be passed as a JSON object consisting of at most 4 key-value pairs; the keys are `"all"`, `"light"`, `"dark"`, and `"highContrast"`, and the values are Plotly.js template objects.
The `"all"` key is for a template that is independent from the color theme and its value may be overridden by the other for the respective themes.
For example, the following code in the _setting.json_ file makes the line color green in the _light_ theme and red in the other themes (i.e., _dark_ and _high contrast_).

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

Users can find the definition of the built-in template objects for the respective color themes in [/src/plotTemplate.ts](https://github.com/fujidana/vscode-spec-data/blob/master/src/plotTemplate.ts) in the GitHub repository.
From this, users may be able to find the name of an attribute they want to change.
See the [Plotly.js Reference](https://plotly.com/javascript/reference/index/) for the complete list of the Plotly.js template attributes.

Please contact the extension author when you find any item that is difficult to read; the current templates the exntention provides may not be suitable.

## Known Issues

### Limitation due to rendering resource

VS Code provides [Webview API](https://code.visualstudio.com/api/extension-guides/webview) for extension authors to implement graphically rich contents.
As its name suggests, the content may be prepared as a webpage, i.e., an aggregate of HTML/CSS/JavaScript.
This extension employs [Plotly.js](https://plotly.com/javascript/) to plot graphs in the HTML body.
While Plotly.js looks performant as an interactive and nice-looking graph generator, to render a preview consisting of a large number of scan dataset cosumues both CPU and memory resources.
For this reason, the maximum number of plots is limited to 25 by default; users can change the this limitation in the _Setting_ window.

### Download button in Plotly.js graph unfunctions

The download button in the Plotly.js mode bar, which appears at the top right corner when the cursor is on the graph, does not function.
Read GitHub Issue #1 for more details.

### Unsupported text encodings for not-in-editor documents

When a preview whose source editor has been closed is reloaded, the extension tries to load the file contents using the value for `files.encoding` setting ID as the text encoding.
The current implementation does not support several text encodings in this situation and defaults to UTF-8 in these cases.
See GitHub issue fujidana/vscode-spec-command#6 for more details.
In practical cases a data file rarely contains non-ASCII characters and thus, this problem will not be very serious.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).

## Tip to make __spec__ automatically set the file extension

_SPECD/standard.mac_ defines `user_filecheck(s)` funciton, which simply returns the input argument `s`.
Users can override this function in order to insert a macro to massage or test the file name for `newfile`.

To let `newfile` add `".spec"` as the file extension, define the following function in __spec__.

```
def user_filecheck(s) '{
    if (s == "null" || s == "/dev/null") {
        return s
    } else if (match(s, "^(.+/)?([^./]+)\$")) {
        # add ".spec" to filename if a user does not specify the file extension
        return sprintf("%s.spec", s)
    } else {
        # simply return the provided filename if a user specifies the file extension
        return s
    }
}'
```
