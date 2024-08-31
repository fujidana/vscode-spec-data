# Change Log

All notable changes to the `fujidana.spec-data` VS Code extension will be documented in this file.

## [Unreleased]

### Added

- Add preview-to-editor scroll synchronization feature, which is currently enabled by default. #2
  - Add `spec-data.preview.scrollEditorWithPreview` setting, which enables or disables this feature.
- Enable to draw a graph using the right axis (_y2_), in addition to the normal left axis (_y_). This feature is experimental and currently enabled by default.
  - Add `spec-data.preview.plot.experimental.enableRightAxis` setting, which enables or disables this feature.

### Changed

- Improve the behavior of "spec-command: Toggle Multiple Selection" command. Now the command updates the preview contents without reloading. As a result, the switch becomes faster and does not break the scroll position.
- Change the settings of several UI components used for multiple selection for better usability.
- Keep the scroll position of a preview when it is shown again after hidden behind other tabs. #7

## [1.6.0] -- 2024-08-27

### Added

- Enable to select multiple data arrays in a graph. This feature is experimental and currently disabled by default.
  - Add `spec-data.preview.plot.experimental.enableMulitpleSelection` setting, which determines the selection mode of new preview panes.
  - Add "spec-data: Toggle Multiple Selection" in the command pallete, which is selectable when the preview panel is active. Use this for ad-hoc switch from the original single-plot behavior.
- Add _first-line_ matching patterns for file associations with: `csv-row` and `csv-column`; a text file starting with `# mode: csv-row` and `# mode: csv-column` are now automatically associated with these languages.

### Changed

- Bump `plotly.js-basic-dist-min` dependency to 2.34.0.
- Update Node.js packages, including a vulnerable dependency.
- Raise the minimum VS Code version to 1.91.0.
- Rename several scope names used in syntax highlighting, based on reference: [Sublime Text / Scope Naming](https://www.sublimetext.com/docs/scope_naming.html).

## [1.5.5] -- 2023-12-30

### Changed

- Bump `plotly.js-basic-dist-min` dependency to 2.27.1.
- Update other Node.js packages, including a vulnerable dependency.
- Raise the minimum VS Code version to 1.85.0.

## [1.5.4] -- 2023-08-20

### Changed

- Let VS Code know first line patterns for `spec-data` and `chiplot`. VS Code judges the file association by the first line if its file extension is unknown.
- Bump `plotly.js-basic-dist-min` dependency to 2.25.2 and `minimatch` dependency to 9.0.3.
- Update other Node.js packages, including a vulnerable dependency.
- Raise the minimum VS Code version to 1.78.0.

## [1.5.3] -- 2023-05-22

### Fixed

- the extension not loaded automatically when an associated file is opened

## [1.5.2] -- 2023-03-18

### Changed

- Bump `plotly.js-basic-dist-min` dependency to 2.20.0 and `minimatch` dependency to 5.1.6.
- Raise the minimum VS Code version to 1.76.0.
- Change syntax highlighting rules for CSV files slightly (optimize the rules for files that mostly contain numeric values).

## [1.5.1] -- 2022-12-28

### Changed

- Bump `plotly.js-basic-dist-min` dependency to 2.17.0 and `minimatch` dependency to 5.1.2.
- Raise the minimum VS Code version to 1.74.0.

### Fixed

- minor syntax highlighting problem in CSV files

## [1.5.0] -- 2022-11-23

### Added

- support for general CSV format consisting of numeric values only. The delmiter can be either a whitespace, tab, or comma and is auto-detected. To allow a user to select in which diretion (row-wise or column-wise) an array is extracted from a table for a graph, two language IDs, `csv-row` and `csv-column`, are provided. The following features are supported:
  - preview feature
  - syntax highlighting feature
- support for DppMCA spectra data file format (language ID: `dppmca`, file extension: `.mca`). DppMCA is a DP5 Digital Pulse Prosessor Display & Acquisition Software for Multichannel Analyzers, developed by Amptek. The following features are supported:
  - preview feature
  - syntax highlighting feature
  - code navigation feature
  - code folding feature

### Changed

- Remove `spec-mca` language ID and migrate the support for ESRF's spec MCA format into `csv-row`.
- Assign `.mca` file extension for `dppmca` (previously for `spec-mca`).
- Bump `plotly.js-basic-dist-min` dependency to 2.16.3.

## [1.4.5] -- 2022-10-12

### Fixed

- graphs not being drawn at all because Plotly.js was not bundled (a bug introduced in v1.4.3)

### Changed

- Bump `plotly.js-basic-dist-min` dependency to 2.15.1.

## [1.4.3] -- 2022-09-26

### Changed

- Migrate the package manager to `pnpm`.
- Bump `plotly.js-basic-dist-min` dependency to 2.14.0 and update other Node.js packages.
- Raise the minimum VS Code version to 1.71.0.

### Fixed

- failure in parsing unopened documents in workspace folders when KOI8-U (Cyrillic) is the preferred text encoding.

## [1.4.2] -- 2022-06-30

### Added

- _High Contrast Light_ color theme support

### Changed

- Bump `plotly.js-basic-dist-min` and `minimatch` dependencies to 2.12.1 and 5.1.0, respectively, and update other Node.js packages.
- Raise the minimum VS Code version to 1.68.0.

## [1.4.1] -- 2022-03-29

### Changed

- Bump `plotly.js-basic-dist-min` and `minimatch` dependencies to 2.11.1 and 5.0.1, respectively, and update other Node.js packages.
- Raise the minimum VS Code version to 1.65.0.

## [1.4.0] -- 2021-12-02

### Added

- support for MCA data format (language ID: `spec-mca`, file extension: `.mca`)
  - preview feature
  - syntax highlighting feature
- point number (i.e., array index) in the x-axis option (`spec-data` and `chiplot` only).

### Changed

- Bump `plotly.js-basic-dist-min` dependency to 2.6.4.

### Fixed

- failure in restoring a `spec-data` preview when VS Code relaunches

## [1.3.0] -- 2021-09-21

### Added

- syntax highlighting feature for chiplot

### Changed

- Make `spec-data` syntax parser a bit more lenient so that delimited text not generated by __spec__ can be plotted after minor modification.
- Improve a behavior after a parser fails to analyze the text content.
- Bump `plotly.js-basic-dist-min` dependency to 2.5.1.
- Rename the configuration key from `spec-data.preview.plot.template` to `spec-data.preview.plot.templates` and eleminate `all` key in it.
- Make the following configuration options available from _Folder Settings_ in a multi-root workspace:
  - `spec-data.preview.retainContextWhenHidden`
  - `spec-data.preview.applyContentSecurityPolicy`
  - `spec-data.preview.plot.maximumNumberOfPlots`
  - `spec-data.preview.plot.height`
  - `spec-data.preview.plot.templates`
  - `spec-data.preview.table.hide`
  - `spec-data.preview.table.columnsPerLine`
  - `spec-data.preview.table.headerType`

### Fixed

- editor-to-preview scroll synchronization not working well when multiple previews were opened for a single file
- `files.encoding` setting for `spec-data` language ID scope wrongly being referred to for a `chiplot` file
- `files.encoding` setting in _Folder Settings_ not being reffered to in a multi-root workspace

### Security

- Add `img-src blob:` in the content security policy of the webview to avoid an error when a download button is pressed (still it does not seem a file is downloaded into a local storage).
- Set the other policies more restrictive.
- Allow preview feature in untrusted workspaces on a condition that the content security policy is forcibly applied (regardless of the `spec-data.preview.applyContentSecurityPolicy` setting).

## [1.2.0] -- 2021-09-14

### Changed

- Adapt for a web extension. The extension becomes available in VS Code for the Web.
- Migrate the extension to use webpack.
- Refer to the built-in `files.encoding` setting ID for the text encoding of files not shown in editors. Previously it was fixed to `"utf-8"`.

### Fixed

- several commands (menu items in the Explorer viewlet) not responding when the extension is not activated beforehand

## [1.1.3] -- 2021-08-23

### Changed

- Add validation rules to configuration options.

### Fixed

- adaptation of several graph styles such as line color to the color theme kinds not working (a bug introduced in v1.1.0)
- keyboard shortcuts not working for either spec data or chiplot files (a bug introduced in v1.1.2)

## [1.1.2] -- 2021-08-19

### Fixed

- keyboard shortcuts not working for chiplot files

## [1.1.1] -- 2021-08-15

### Changed

- Migrate the dependency from `plotly.js-dist-min` to `plotly.js-basic-dist-min` (smaller package) and bump the version to 2.3.1.

### Fixed

- axis label being lost when the log-scale checkbox is checked

### Security

- Remove `unsafe-eval` from the `script-src` in the Content Security Policy so as to apply a stricter security rule. (Several partial bundles of Plotly.js including `basic` have been function-constructor-free, while the main Plotly.js bundle has not been yet. See GitHub Issue plotly/plotly.js#897 "Security warning: avoid using function constructor" issuecomment-781422217 for details.)

## [1.1.0] -- 2021-07-22

### Added

- support for chiplot format (preview feature only)
- checkboxes in a preview to control y-axis scaling (linear or log) of the respective plots
- persistence of state in a preview, such as checkbox and dropdown menu selections
  - Restore the state when a preview becomes visible after being moved into the background.
    - By default the state inside graphs such as scaling is not stored. When one wants to keep this state, enable `spec-data.preview.retainContextWhenHidden` option (but keep it in mind that this increases memory usage).
  - Restore the state when VS Code restarts.

### Changed

- Bump `plotly.js-dist-min` dependency to 2.2.1.

## [1.0.0] -- 2021-07-08

### Added

- extension icon
- checkboxes in a preview to control the visibility of the respective plots
- checkboxes in a preview to control the visibility of the respective motor-position tables
- dropdown lists at the top of respective graphs in a preview for data column selection
- adaptation of graph apperance to the color theme kinds of the window (_light_, _dark_, and _high contrast_)
- commands acceccible from file explorer and editor
  - _Open Locked Preview_
  - _Open Locked Preview to the Side_
- commands accessible from a preview
  - _Show Source_
  - _Refresh Preview_
  - _Toggle Preview Locking_
- configuration options
  - `spec-data.preview.retainContextWhenHidden`
  - `spec-data.preview.scrollPreviewWithEditor`
  - `spec-data.preview.plot.maximumNumberOfPlots`
  - `spec-data.preview.plot.height`
  - `spec-data.preview.plot.template`
  - `spec-data.preview.table.hide`
  - `spec-data.preview.table.columnsPerLine`
  - `spec-data.preview.table.headerType`
  - `spec-data.preview.applyContentSecurityPolicy`

### Changed

- language ID from `spec-scan` to `spec-data` (since the official PDF manual written by CSS calls it _standard data file format_)
- preview window handling
  - In the previous version, a new preview is created whenever requested.
  - In this version, at most a single _Live Preview_ (IOW, _Unlocked Preview_) is open and the preview is reused when the active editor opens another __spec__ data file. One can handle multiple previews by _Open Locked Preview_ and other relevant commands.
- deportation of inline scripts from preview HTML source (better coding manner known as unobtrusive JavaScript)

### Security

- Fix a data injection vulnerability, which occured when angle brackets (`<`, `>`) were included in a data file.
- Support _Workspace Trust_:
  - Preview feature is disabled in untrusted workspaces because protection against data injection has not been comprehensively surveyed.
  - The other features are allowed in untrusted workspaces.
- Apply a content security policy to a preview. (This can be disabled by `spec-data.preview.applyContentSecurityPolicy` option)

## [0.1.0] -- 2021-06-16

### Added

- syntax highlighting features
- code navigation feature
- code folding feature
- preview feature
  - showing motor positions before scan in table
  - showing scan data in graphical view, powered by [Plotly.js](https://plotly.com/javascript/) v2.0.0
- commands accessible from file explorer and editor
  - _Open Preview_
  - _Open Preview to the Side_

[Unreleased]: https://github.com/fujidana/vscode-spec-data/compare/v1.6.0...HEAD
[1.6.0]: https://github.com/fujidana/vscode-spec-data/compare/v1.5.5...v1.6.0
[1.5.5]: https://github.com/fujidana/vscode-spec-data/compare/v1.5.4...v1.5.5
[1.5.4]: https://github.com/fujidana/vscode-spec-data/compare/v1.5.3...v1.5.4
[1.5.3]: https://github.com/fujidana/vscode-spec-data/compare/v1.5.2...v1.5.3
[1.5.2]: https://github.com/fujidana/vscode-spec-data/compare/v1.5.1...v1.5.2
[1.5.1]: https://github.com/fujidana/vscode-spec-data/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/fujidana/vscode-spec-data/compare/v1.4.5...v1.5.0
[1.4.5]: https://github.com/fujidana/vscode-spec-data/compare/v1.4.3...v1.4.5
[1.4.3]: https://github.com/fujidana/vscode-spec-data/compare/v1.4.2...v1.4.3
[1.4.2]: https://github.com/fujidana/vscode-spec-data/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/fujidana/vscode-spec-data/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/fujidana/vscode-spec-data/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/fujidana/vscode-spec-data/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/fujidana/vscode-spec-data/compare/v1.1.3...v1.2.0
[1.1.3]: https://github.com/fujidana/vscode-spec-data/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/fujidana/vscode-spec-data/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/fujidana/vscode-spec-data/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/fujidana/vscode-spec-data/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/fujidana/vscode-spec-data/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/fujidana/vscode-spec-data/releases/tag/v0.1.0
