# Changelog

## 1.6.4 — 2026-11-14

### Fixed

- **A large result no longer blocks the kernel.** `ExportString[value, "MathML"]` goes through
  LibraryLink, ignores `Abort`, and degrades sharply with size — `Range[10^5]` hung the call for
  the whole 180 s timeout and `Range[10^3]` already hit `$RecursionLimit`. Values above
  `$maxTypesetLeaves` (500) or `$maxTypesetBytes` (200 KB) now skip MathML/TeX and are shown as
  `InputForm` text; the largest values are replaced by a one-line size summary.
- **Console lines no longer carry `InputForm` quotes.** `Print["x = ", 5]` reached the console as
  `"x = "5`; quoted fragments at the start of a line are now decoded.

## 1.6.3 — 2026-11-14

### Fixed

- **`ClearAll["Global`*"]` no longer breaks the call.** The bridge frame that runs a cell kept
  its `Module` state in the `Global`` context, so a cell that cleared `Global`` also cleared the
  start time and the cell type of the frame still on the stack; the cell record then failed to
  match its pattern, the document was left with an unevaluated `Join`, and the whole response
  failed with "The result could not be serialized as JSON". The state that must outlive the
  evaluation is now passed as arguments to `WolframBridge`evalHeldCell` / `finishRun`, whose
  pattern variables live in `WolframBridge``.
- **A malformed document can no longer lose the result.** `publish` coerces non-JSON leaves to
  their `InputForm` text, marks the document `coerced: true` and still answers; `wolfram_eval`
  reports that the payload was repaired.
- **`evaluateMarked` retries once.** `wolfram_render`, `wolfram_state` and `wolfram_verify` share
  a marked-evaluation path that could return an empty console and "no structured result" when a
  response was lost; one immediate retry now covers that, and the error names the retry.

### Changed

- **`exportNotebook` defaults to `false`.** The panel document is still published on every call,
  but a `.nb` file is written only when `exportNotebook: true` is passed — no more one file per
  evaluation in `wolfram-notebooks/`.

## 1.6.2 — 2026-11-13

### Changed

- **Package renamed** from `@nashihang777/dsh-wolfram-nb` to `dsh-wolfram-nb` (unscoped).
  The Cordis plugin id, client tab id, badges and install examples use the new name.

## 1.6.1 — 2026-11-13

### Added

- **`wolfram_alpha` tool.** Asks Wolfram|Alpha a natural-language query (for example
  `solve 2 x + 3 == 7`) and returns its answer. With `steps` (default `true`) it finds the
  query's `__Step-by-step solution` pod state, requests `__Show all steps`, and falls back to
  the plain answer when Wolfram|Alpha offers no steps. Internet is enabled only for the query
  via `Block[{$AllowInternet = True}, …]`; no global setting is changed.

## 1.6.0 — 2026-11-13

### Added

- **`wolfram_verify action=antiderivative`.** Differentiates the claimed antiderivative and
  compares it with the integrand; `assumptions` and `range` apply.
- **Initial/boundary conditions for `wolfram_verify ode`.** The new `conditions` array, for
  example `["y[0] == 1"]`, is substituted into the candidate solution and checked together with
  the residual; the summary says how many conditions were checked.
- **`status` in every verification result.** One of `verified_symbolic`, `numerically_consistent`,
  `falsified`, `inconclusive`; a numerical pass is no longer presented as plain `ok`.

### Changed

- **`wolfram_verify` simplifies before it samples.** `integral` now compares
  `FullSimplify[integral - result, assumptions]` first, so symbolic-parameter claims such as
  `Integrate[Exp[-a x^2], {x, 0, Infinity}]` are proved instead of reported as failed and a
  domain-dependent case is `inconclusive` rather than `FAILED`. `identity` uses `FullSimplify`
  (was `Simplify`); `ode` simplifies the residual symbolically before any sampling.
- **Verification runs in its own kernel.** Each call starts a throwaway `math.exe`, so a
  definition left in the session (for example `y[x_] := Exp[x]`) can no longer make a wrong
  candidate look correct.

## 1.5.0 — 2026-11-11

### Added

- **Symbolic identity check in `wolfram_verify`.** `identity` first evaluates
  `Simplify[lhs - rhs, assumptions]`; when the difference is exactly zero the summary says the
  identity was proved symbolically. New `assumptions` option (e.g. `x >= 0`).
- **Job graphics in the panel.** When a finished `wolfram_job` document contains graphics or
  images, it is published to `.dsh-wolfram/latest.json`, so the Wolfram panel shows a
  background plot; `result` mentions it.

## 1.4.2 — 2026-11-11

### Fixed

- **Auto-MaTeX in `wolfram_render`.** The `Needs["MaTeX`"]` prelude now runs in a separate cell,
  so `MaTeX[...]` in the expression is parsed *after* MaTeX is loaded. Previously the label stayed
  a `Global`MaTeX` expression and was drawn as literal text.

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

First public release as `dsh-wolfram-nb`.

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
