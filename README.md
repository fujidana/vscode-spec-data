# __spec__ Data File Extension for Visual Studio Code

The extension enhances user experiences in browsing __spec__ data files with Visual Studio Code.
__spec__ data files referred to here are files the __spec__ software outputs during various scan commands; the official __spec__ PDF manual call them _standard data file format_.

__spec__ does not specify the filename extension for this data format.
While this VS Code extension treats `.spec` as the default file extension for the files (language identifier: `spec-data`), a user can change the association by oneself.
Read [Language Support in Visual Studio Code](https://code.visualstudio.com/docs/languages/overview) (official document of VS Code) for further details.

The extension additionally supports the following formats:

- _chiplot file format_ (language identifier: `chiplot`, default extension: `.chi`): a text file format in which __fit2d__ software imports and exports one-dimensional dataset such as scattering profiles.
- _MCA file format_ (language identifier: `spec-mca`, default extension: `.mca`): a text file format in which each row consists of an array of number and represents a spectrum or profile of some data. The separator may be a tab or whitespace. MCA (multichannel analyzer) data in __spec__ can be easily exported in this format by `array_dump()` function. A MCA files created by ESRF's __spec__ macro, [BLISS / mca.mac](https://www.esrf.fr/blissdb/macros/macdoc.py?macname=mca.mac), are also supported.

## What's __spec__?

> __spec__ is internationally recognized as the leading software for instrument control and data acquisition in X-ray diffraction experiments.
> It is used at more than 200 synchrotrons, industrial laboratories, universities and research facilities around the globe.

_cited from [CSS - Certified Scientific Software](https://www.certif.com) homepage._

Note that the extension is not the official one developed by Certified Scientific Software.
Use [GitHub issues](https://github.com/fujidana/vscode-spec-data/issues) for bug reports and feature requests about the extension.

## Features

- __Syntax highlighting__
- __Code navigation__ (only for `spec-data`)
  - __Listing symbols in the active editor__: the list shown in the _outline_ view in the _Explorer_ viewlet and breadcrumbs at the top of the editor view
- __Code folding__ (only for `spec-data`)
- __Preview__
  - motor positions just before a scan in a table view (only for `spec-data`)
  - scan data depicted in a graphical and interactive graph, powered by [Plotly.js](https://plotly.com/javascript/). A user can select a pair of columns to be drawn.
  - scroll sync of the editor and preview (Currently only _scroll-preview-from-editor_ functions; _scroll-editor-from-preview_ does not.)

![screenshot](resources/screenshot.png)

## Requirements

Nothing.

## Extension Settings

This extension contributes configuration options, accecible from the _Settings_ editor (Win/Linux: `Ctrl+,`, Mac: `Cmd+,`).
Read [Visual Studio Code User and Workspace Settings](https://code.visualstudio.com/docs/getstarted/settings) for details about the _Settings_ window.

### Plotly.js template

The extension internally switches Plotly.js templates in order to coordinate the appearance of graphs with the four kinds of VS Code color themes.
A user can modify the appearance by overriding the templates via the `spec-data.preview.plot.templates` configuraiton option.

The option shall be passed as a JSON object consisting of at most 4 key-value pairs.
The key shall be either `"light"`, `"dark"`, `"highContrast"`, or `"highContrastLight"` and the value shall be a Plotly.js template object for the color theme the corresponding key represents.
The following example code in the _setting.json_ file makes the line color green in the _light_ theme.

```json
{
    "spec-data.preview.plot.templates": {
        "light": {
            "data": [
                {"type": "scatter", "line": { "color": "#00FF00" } }
            ]
        }
    }
}
```

The default template objects for the respective color themes can be found in [/src/plotTemplate.ts](https://github.com/fujidana/vscode-spec-data/blob/master/src/plotTemplate.ts) in the GitHub repository.
This may help a user to find the name of an attribute he/she wants to change.
See the [Plotly.js Reference](https://plotly.com/javascript/reference/index/) for the complete list of the Plotly.js template attributes.

## Known Issues

### Limitation due to rendering resource

VS Code provides [Webview API](https://code.visualstudio.com/api/extension-guides/webview) for extension authors to implement graphically rich contents.
As its name suggests, the content may be prepared as a webpage, i.e., an aggregate of HTML/CSS/JavaScript.
This extension employs [Plotly.js](https://plotly.com/javascript/) to plot graphs in the HTML body.
While Plotly.js looks performant as an interactive and nice-looking graph generator, to render a preview consisting of a large number of scan dataset cosumues both CPU and memory resources.
For this reason, the maximum number of plots is limited to 25 by default; a user can change the this limitation in the _Settings_ window.

### Download button in Plotly.js graph unfunctions

The download button in the Plotly.js mode bar, which appears at the top right corner when the cursor is on the graph, does not function.
Read GitHub Issue #1 for more details.

### Unsupported text encodings for not-in-editor documents

When a preview whose source editor has been closed is reloaded, the extension tries to load the file contents using the value for `files.encoding` setting ID as the text encoding.
The current implementation does not support several text encodings in this situation and defaults to UTF-8 in these cases.
See GitHub issue fujidana/vscode-spec-command#6 for more details.
In most cases data files will consist of ASCII characters only.
Then, it is safely loaded as UTF-8 and the problem does not arise.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).

## Tips

### Preview delimited text not generated by __spec__

The `spec-data` parser treats lines of delimited number that follow a `#L` _column label_ line as an numeric array.
In other word, __one may be able to make a graph for delimited text when one just adds a `#L` line at the top of the content__.

The parser is made torelant.
It accepts a tab character in addition to whitespaces as a delimiter and handles redundant delimiters (typically used for alignment) properly.
One thing that should be noted is that, __spec__ uses double whitespace as a delimiter of column labels (probably by reason of disticution from a single whitespace that may be included in a column label) and the extension follows this rule.
When a tab character is used as a delimiter, a user do not care about this problem (double tab characters are unnecessary).

The following is a minimum example of the __spec__ data format the extension can handle.

```
#L time [sec]  distance [m]
          0.0        -6.2e2
        100.0         9.1e2
        200.0         3.1e3
```

A user can test it by the following procedure:

1. Create a new window
2. Select "spec data" as its language mode
3. Copy the example above and paste it into the editor
4. Open Preview (Win/Linux: `Ctrl+Shift+V`, Mac: `Cmd+Shift+V`)

If one wants to draw graph from a set of numbers in a row (i.e., line, not a column), make VS code recognize the file as an MCA file.

### Make __spec__ output an MCA file

The following code is an example to output the data of an MCA device in __spec__.
This assumes an MCA device that has 1024 data points of 32-bit unsigned integer is configured at #0 slot in __spec__.

```
# create a buffer
ulong array buffer[1024]

# copy MCA data to the buffer
mca_sget(0, buffer)

# output data in a row.
array_op("row_wise", buffer, 1)
array_dump("output.mca", buffer)
```

Each time `array_dump()` is executed, a new line consisting of 1024 integers is appended at the end of file.

### Make __spec__ automatically set the file extension

_SPECD/standard.mac_ defines `user_filecheck(s)` funciton, which simply returns the input argument `s`.
A User can override this function in order to insert a macro to massage or test the file name for `newfile`.

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
