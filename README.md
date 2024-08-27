# __spec__ Data File Extension for Visual Studio Code

The extension enables a user to browse spreadsheet-like data in a graph with Visual Studio Code.
The graph feature can be controlled in a similar way with a built-in Markdown Preview feature.
For example, _spec data:Open Preview_ command (Win/Linux: `Ctrl+Shift+V`, Mac: `Cmd+Shift+V`) is available when a supported file is open.

The data file formats the exension supports are as follows:

- __CSV file__ (ID: `csv-column`, `csv-row`): CSV (character-separated values) files.
  - A pair of columns in a `csv-column` file and that of rows in a `csv-row` file can be graphically plotted.
  - All cells must be numeric; string may appear only in a header line that starts with a hash character (`#`).
  - A delimiter may be either a whitespace, tab, or comma, and is auto-detected.
  - The extension does not associate the file extensions such as `.csv`, `tsv`, or `dat` with and language ID by the following reasons:
    - The extension can not determine from the file extension which direction (column-wise or row-wise) an array should be extracted from a table.
    - The extension do not intend to support all possible features for general CSV files. The main feature is drawing a graph and thus files consisting of number only are targeted.
  - A data file exported by ESRF's __spec__ macro, [BLISS / mca.mac](https://www.esrf.fr/blissdb/macros/macdoc.py?macname=mca.mac), is also covered in `csv-row`.
- __spec standard data file__ (ID: `spec-data`, extension: `.spec`): files the __spec__ software outputs during various scan commands.
  - Note that the __spec__ software does not specify a file extension for the data format. Use of `.spec` for __spec__ data file is just the preference of the extension author.
- __fit2d chiplot file format__ (ID: `chiplot`, extension: `.chi`): a text file format in which __fit2d__ software imports and exports one-dimensional dataset such as scattering profiles.
- __DppMCA spectra data file format__ (ID: `dppmca`, extension: `.mca`): DppMCA is DP5 Digital Pulse Prosessor Display & Acquisition Software for Multichannel Analyzers, developed by Amptek.

While the default file associations (relations between language identifier and file extensions (or blob pattern)) are set as listed above, a user can customize them by oneself using `#files.associations#` setting.
Read [Language Support in Visual Studio Code](https://code.visualstudio.com/docs/languages/overview) (official document of VS Code) for further details.

## What's __spec__?

> __spec__ is internationally recognized as the leading software for instrument control and data acquisition in X-ray diffraction experiments.
> It is used at more than 200 synchrotrons, industrial laboratories, universities and research facilities around the globe.

_cited from [CSS - Certified Scientific Software](https://www.certif.com) homepage._

Note that the extension is not the official one developed by Certified Scientific Software.
Use [GitHub issues](https://github.com/fujidana/vscode-spec-data/issues) for bug reports and feature requests about the extension.

## Features

- __Syntax highlighting__
- __Code navigation__ (`spec-data` and `dppmca` only)
  - __Listing symbols in the active editor__: the list shown in the _outline_ view in the _Explorer_ viewlet and breadcrumbs at the top of the editor view
- __Code folding__ (`spec-data` and `dppmca` only)
- __Preview__
  - motor positions just before a scan in a table view (`spec-data` only)
  - scan data depicted in a graphical and interactive graph, powered by [Plotly.js](https://plotly.com/javascript/). A user can select a pair of columns to be drawn.
  - scroll sync of the editor and preview (Currently only _scroll-preview-from-editor_ works; _scroll-editor-from-preview_ does not.)

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
                { "type": "scatter", "line": { "color": "#00FF00" } }
            ]
        }
    }
}
```

The default template objects for the respective color themes can be found in [src/plotTemplate.ts](https://github.com/fujidana/vscode-spec-data/blob/master/src/plotTemplate.ts) in the GitHub repository.
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

When a preview whose source editor has been closed is reloaded, the extension tries to load the file contents using the value for `#files.encoding#` setting ID as the text encoding.
The current implementation does not support several text encodings in this situation and defaults to UTF-8 in such cases.
See GitHub issue [fujidana/vscode-spec-command#6](https://github.com/fujidana/vscode-spec-command/issues/6) (another extension) for more details.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).

## Tips

### File associations using the file contents

In addition to a file extension and file pattter, VS Code refers to the first line of a file in order to associate the file with a language (IOW, editor mode).
A text file starting with `# mode: csv-row` and `# mode: csv-column` is automatically associated with `csv-row` and `csv-column`, respectively.

### Make __spec__ output a row-wise CSV file

The following code is an example to output the data of an MCA device in __spec__.
This assumes an MCA device that has 1024 data points of 32-bit unsigned integer (`ulong`) type is configured at #0 slot in __spec__.

```
# create a buffer
ulong array buffer[1024]

# copy MCA data to the buffer
mca_sget(0, buffer)

# output data in a row.
array_op("row_wise", buffer, 1)
array_dump("output.csv", buffer)
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
