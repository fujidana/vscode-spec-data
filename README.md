# __spec__ Data File Extension for Visual Studio Code

The extension enhances user experiences in browsing data files __spec__ software outputs after execution of various built-in scan commands.
The file is referred to as the _standard data file format_ in the __spec__ PDF mannual.

__spec__ does not specify the filename extension for the data format.
While this VS Code extension treats `.spec` as the default file extension (language identifier: `spec-data`), VS Code users can change the association by themselves.
Read [Language Support in Visual Studio Code](https://code.visualstudio.com/docs/languages/overview) (official document of VS Code) for further details.

## What's __spec__?

> __spec__ is internationally recognized as the leading software for instrument control and data acquisition in X-ray diffraction experiments.
> It is used at more than 200 synchrotrons, industrial laboratories, universities and research facilities around the globe.

_cited from [CSS - Certified Scientific Software](https://www.certif.com) homepage._

Note that the extension is not the official one developed by Certified Scientific Software.
<!-- Use [GitHub issues](https://github.com/fujidana/vscode-spec/issues) for bug reports and feature requests about the extension. -->

## Features

- __Syntax highlighting__
- __Code navigation__
  - __Listing symbols in the active editor__: the list shown in the _outline_ view in the _Explorer_ viewlet and breadcrumbs at the top of editor
- __Code folding__
- __Preview__
  - motor positions just before a scan in a table view
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

The option is a JSON object consisting of at most 4 key-value pairs; the keys are `"all"`, `"light"`, `"dark"`, and `"highContrast"`; the values are Plotly.js template objects.
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

Users can find the definition of the built-in template objects for the respective color themes in [/src/plotTemplate.js](https://github.com/fujidana/vscode-spec-data/blob/master/src/plotTemplate.ts) in the GitHub repository.
From this, users may be able to find the name of an attribute they want to change.
See the [Plotly.js Reference](https://plotly.com/javascript/reference/index/) for the complete list of the Plotly.js template attributes.

Please contact the developer when you find any item that is difficult to read; the current templates the exntention provides may not be suitable.

## Known Issues

### Limitation coming from performance

VS Code provides [Webview API](https://code.visualstudio.com/api/extension-guides/webview#scripts-and-message-passing) for extension developers to implement graphically rich contents.
In other words, such contents must be built in the world of HTML/CSS/JavaScript.
This extension employs [Plotly.js](https://plotly.com/javascript/) to plot graphs within this scheme.
As a consequcense, to render a preview of a scan file that contains a large number of scan dataset cosumues both CPU and memory resources.
To avoid a performance problem, the maximum number of plots is 25 by default; users can change the this limitation in the _Setting_ window.

### Download button in Plotly.js graph unfunctions

The download button in the Plotly.js mode bar, which appears at the top right corner when the cursor is on the graph, does not function.
Read [GitHub Issues #1](https://github.com/fujidana/vscode-spec-data/issues/1) for more details.

## Release Notes

See `CHANGELOG.md`.

## Tip to automatically set the file extension

_SPECD/standard.mac_ defines `user_filecheck(s)` funciton, which simply returns the input argument `s`.
Users can override this function in order to insert a macro to massage or test the file name for `newfile`.

To let `newfile` add `".spec"` as the file extension, define the following function in __spec__.

```
def user_filecheck(s) '{
    if (s == "null" || s == "/dev/null") {
        return s
    } else if (match(s, "^(.+/)?([^./]+)\$")) {
        # add ".spec" to filename if a user did not specify the file extension
        return sprintf("%s.spec", s)
    } else {
        # simply return the provided filename if a user specified the file extension
        return s
    }
}'
```
