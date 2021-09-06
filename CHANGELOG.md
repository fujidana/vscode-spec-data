# Change Log

All notable changes to the __vscode-spec-data__ extension will be documented in this file.

## [Unreleased]

### Changed

- Migrate the extension to use webpack.

## [Unreleased]

### Changed

- Refer to the built-in `files.encoding` setting ID for the text encoding of files not shown in editors. Previously it was fixed to `"utf-8"`.

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

- Migrate the dependency from `plotly.js-dist-min` to `plotly.js-basic-dist-min` (smaller package) and bump the version to 2.3.1

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

- Bump `plotly.js-dist-min` dependency to 2.2.1

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
- support _Workspace Trust_:
  - Preview feature is disabled in untrusted workspaces because protection against data injection has not been comprehensively surveyed.
  - The other features are allowed in untrusted workspaces.
- Apply a content security policy to a preview. (This can be disabled by `spec-data.preview.applyContentSecurityPolicy` option)

## [0.1.0] -- 2021-06-16

### Added

- syntax highlighting features
- code navigation features
- code folding features
- preview features
  - showing motor positions before scan in table
  - showing scan data in graphical view, powered by [Plotly.js](https://plotly.com/javascript/) v2.0.0
- commands accessible from file explorer and editor
  - _Open Preview_
  - _Open Preview to the Side_

[Unreleased]: https://github.com/fujidana/vscode-spec-data/compare/v1.1.3...HEAD
[1.1.3]: https://github.com/fujidana/vscode-spec-data/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/fujidana/vscode-spec-data/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/fujidana/vscode-spec-data/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/fujidana/vscode-spec-data/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/fujidana/vscode-spec-data/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/fujidana/vscode-spec-data/releases/tag/v0.1.0
