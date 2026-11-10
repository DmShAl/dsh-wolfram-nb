# Changelog

## 1.4.1 — 2026-11-11

### Added

- **`wolfram_state clear`** drops the Global definitions (symbols without `$`; the kernel keeps
  running, temporary `Module` symbols are left alone).
- **`wolfram_render` auto-loads MaTeX** when the expression contains `MaTeX[...]`, so a
  publication plot no longer needs a separate `Needs["MaTeX`"]` call.
- **`wolfram_state symbols` filters** names containing `$` and symbols without definitions,
  hiding the bridge's internal leftovers.

## 1.4.0 — 2026-11-11

### Added

- **`wolfram_batch` tool.** Run several independent Wolfram Language snippets, each in its own
  kernel, with `maxParallel` concurrency (default 4, up to 12 items), per-item timeouts, and a
  per-item OK/FAILED report.

### Changed

- **Inert-result diagnostics.** When `Integrate`/`Solve`/`Reduce`/`DSolve`/`Simplify`/`Limit`/
  `Sum`/`Series` returns itself unchanged, the summary now names the likely next step
  (`Solve` → `Reduce`/`NSolve`, `Integrate` → `NIntegrate`, ...).

## 1.3.0 — 2026-11-11

### Added

- **`wolfram_verify` tool.** Numeric identity sampling (`identity`), ODE residual testing
  (`ode`) and integral/closed-form comparison (`integral`) with a configurable tolerance.
- **`wolfram_state` tool.** `status` (Global symbols, memory, `$Assumptions`, packages),
  `symbols`, and `save`/`load` of the Global context via `DumpSave`/`Get`.
- **`wolfram_render` tool.** Export a graphics expression to PNG/SVG/PDF/JPG with
  `ImageResolution`, creating the target directory and reporting the file size.

- **`kernelArgs` config.** Extra argv entries for `math.exe`, e.g. `['-pacletreadonly']` to keep
  paclet auto-updates (and their network stalls) out of the way.
- **Per-call `timeoutMs`** on `wolfram_eval`, overriding the configured default for one call.

- **`wolfram_job` tool.** A long evaluation can run as a background job in its own kernel:
  `submit` returns an id, while `status`/`result`/`cancel`/`list` manage it. 30 min default
  timeout, 20 jobs kept (2 running at once), finished jobs expire after an hour.
### Changed

- **Configurable job concurrency.** `maxRunningJobs` (default 4) caps concurrent jobs;
  submissions beyond it wait in a FIFO queue (`queued`, with a queue position) instead of
  being rejected.

- **Job progress.** `wolfram_job status` now includes the last console lines a running
  job printed (`Print` output), so long jobs are observable while they run.

- **Timeout errors carry the kernel console.** The last lines the kernel printed are appended to
  the timeout message, so a stalled download is visible instead of a bare "timed out".
- `wolfram_notebook action="status"` now reports the kernel arguments and the timeout.
- **Bridge/host protocol handshake.** `bridge.wl` reports its version on the ready line; a
  mismatch with `index.js` fails with an explicit "update both files" error instead of
  misbehaving silently.
- **Suggested fixes for common messages.** `Power::infy`, `Part::partw`, `Syntax::sntxi`,
  network/Entity messages and the paclet-download stall each append a one-line hint to the
  tool summary.
- **`status` reports the bridge version and counters** (evaluations, timeouts, restarts).
- **Child kernels are killed on host exit**, so a crashed host no longer leaves `math.exe`
  processes behind.

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
