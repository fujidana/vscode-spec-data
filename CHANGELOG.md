# Change Log

All notable changes to the `vscode-spec-data` extension will be documented in this file.

## [Unreleased]

- Added
  - checkboxes in a preview to control the visibility of the respective plots
  - checkboxes in a preview to control the visibility of the motor-position tables
  - dropdown lists at the top of respective graphs in a preview for data column selection
  - automatic adaptation of graph apperance according to the color theme kinds of the window (_light_, _dark_, and _high contrast_)
  - commands acceccible from file explorer and editor
    - _Open Locked Preview_
    - _Open Locked Preview to the Side_
  - commands accessible from a preview
    - _Show Source_
    - _Refresh Preview_
    - _Toggle Preview Locking_
  - support for _Workspace Trust_
    - Preview feature is disabled in untrusted workspaces because protection against content injection has not been comprehensively surveyed.
  - configuration options
    - `vscode-spec-data.preview.retainContextWhenHidden`
    - `vscode-spec-data.preview.scrollPreviewWithEditor`
    - `vscode-spec-data.preview.plot.maximumNumberOfPlots`
    - `vscode-spec-data.preview.plot.height`
    - `vscode-spec-data.preview.plot.template`
    - `vscode-spec-data.preview.table.hide`
    - `vscode-spec-data.preview.table.columnsPerLine`
    - `vscode-spec-data.preview.table.headerType`
- Changed
  - language ID from `spec-scan` to `spec-data` (since CSS's PDF manual call it _standard data file format_)
  - preview window handling
    - In the previous version, a new preview is created whenever requested.
    - In this version, at most a single _Live Preview_ (IOW, _Unlocked Preview_) is open and the preview is reused when the active editor opens another __spec__ data file. One can handle multiple previews by _Open Locked Preview_ and other relevant commands.
  - updated `plotly.js-dist-min` from 2.0.0 to 2.1.0
  - deportation of inline scripts from preview HTML source (better coding manner known as unobtrusive JavaScript)
- Security
  - Fix an elementary HTML injection vulnerability, which occured when angle brackets (`<`, `>`) were included in data files

## [0.1.0] - 2021-06-16

- Added
  - syntax highlighting features
  - code navigation features
  - code folding features
  - preview features
    - showing motor positions before scan in table
    - showing scan data in graphical view, powered by [Plotly.js](https://plotly.com/javascript/)
  - commands accessible from file explorer and editor
    - _Open Preview_
    - _Open Preview to the Side_

[Unreleased]: https://github.com/fujidana/vscode-spec-data/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/fujidana/vscode-spec-data/releases/tag/v0.1.0
