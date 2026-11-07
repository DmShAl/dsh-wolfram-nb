# Changelog

## 1.2.0 — 2026-11-07

### Added

- **Resizable pictures in the notebook panel.** Every rendered `Graphics`/`Image` output now
  carries a drag handle in its bottom-right corner: drag to set an explicit width (aspect ratio is
  preserved, and an image may grow past the panel, which then scrolls), double-click the image or
  the handle to return to fitting the panel width. The handle is keyboard-reachable and resizes
  with the arrow keys.

### Fixed

- **A cell holding several top-level expressions broke the whole document.** `ToExpression` with
  `HoldComplete` returns one argument per expression, so `ReleaseHold` produced a `Sequence`;
  splicing it into the cell record made `ExportString[..., "JSON"]` fail and the panel received
  nothing. Such cells are now folded into a single `CompoundExpression`, and a value that is
  nevertheless a `Sequence` is kept as a list.
- **A serialization failure no longer loses the request.** If the document still cannot be
  exported, the bridge answers with an error document instead of an empty response.

## 1.1.0 — 2026-11-07

First public release as `@nashihang777/dsh-wolfram-nb`.

### Fixed

- **Exported `.nb` output cells contained `value$…` placeholders.** `MakeBoxes` has
  `HoldAllComplete`, so boxing inside a `Module` captured the local symbol instead of its
  value. The exporter now uses `ToBoxes[value, StandardForm]`.
- **Re-opened notebooks did not render graphics.** `GraphicsBox` stores box primitives, not a
  `Graphics` expression; converting them to MathML or text produced garbage. Import now decodes
  the cell with `MakeExpression`, recognises `Graphics` / `Graphics3D` / `Legended`, and
  re-rasterizes it to PNG.
- **Grouped cells disappeared.** Mathematica stores input/output pairs in `CellGroupData`;
  the importer now flattens nested groups.
- **Unbounded runtime growth.** Every publish wrote a `run-*.json` snapshot that nothing read;
  only `.dsh-wolfram/latest.json` is written now.

### Added

- Panel **“Open…”** picker listing the workspace’s `.nb` files, with a manual path field.
- `/wolfram-open <path>` Host command, so the panel can switch notebooks without a model turn.
- Kernel discovery across config, `WOLFRAM_KERNEL` / `MATHEMATICA_KERNEL`, Wolfram’s registry
  records, standard `Program Files` layouts and `PATH`, with a reported source in
  `wolfram_notebook action="status"`.

### Changed

- MIT license and Wolfram trademark disclaimer.
