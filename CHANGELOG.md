# Changelog

## 1.11.2 — 2026-11-18

### Changed

- **Usage text gets the space after a comma** — typesetting always renders it, and a linear
  reading needs it: `Plot[f, {x, x_min, x_max}]` instead of `Plot[f,{x,x_min,x_max}]`.
- The usage block in the answer is 600 characters instead of 300, which covers `NDSolve`-sized
  messages without a second call.

## 1.11.1 — 2026-11-18

### Fixed

- **`wolfram_help` picked the wrong symbol.** The sort key was written
  `SortBy[names, {StringLength, #} &]`, where `StringLength` is a symbol rather than a call, so
  the first element of the key never varied and the list fell back to alphabetical order: `Plot`
  resolved to `AbsArgPlot`, `Integrate` to `AsymptoticIntegrate`. The key is
  `{StringLength[#], #} &` and an exact name match is moved to the front.
- **Ellipsis and math symbols survived.** `wuAscii` compared literal `…`, `∈`, `∫` from the source
  file, whose encoding is not guaranteed; the rules never matched and the fallback dropped the
  characters. The map now uses `\:XXXX` escapes, so `{f_1,f_2,...}`, `{x} in reg` and `Integral f
  d x` come out right.

## 1.11.0 — 2026-11-18

### Added

- **Usage text in `wolfram_help`.** `usage.wl` flattens the box-encoded usage messages without a
  front end: a scanner finds the `\!\(\*...\)` islands (box escapes are single private-use
  characters, and nested `\( ... \)` are counted), each island is parsed with `ToExpression[...,
  HoldComplete]` and flattened through a closed whitelist of box heads (`RowBox`, `StyleBox`,
  `SubscriptBox`, `TemplateBox`, …). An unknown head fails instead of guessing, and the caller
  reports `degraded`. Example output: `FindRoot[f,{x,x_0}] searches for a numerical root …`.
- **`SyntaxInformation` in the same answer** — `ArgumentsPattern` gives the call shape honestly
  (`{_, {_, __}, OptionsPattern[]}`) where prose cannot.
- The text is transliterated to ASCII before the JSON line: the kernel escapes non-ASCII as
  `\[Name]`/`\ddd`, which is not valid JSON and used to break the marker.

### Note

- `ToString[Plot::usage]` pre-renders the box escapes (1569 → 482 characters), so the flattener
  reads `MessageName[sym, "usage"]` directly instead.

## 1.10.0 — 2026-11-18

### Added

- **`wolfram_check`** — static inspection with the bundled CodeInspector 1.13 before anything runs:
  syntax errors and suspicious constructs with line, severity and message, and the code is never
  evaluated. Cheap insurance against a wasted round trip on broken syntax.
- **`wolfram_help`** — symbol lookup in the running kernel: matching names, attributes and the real
  option names with their defaults (`FindRoot — 11 option(s): WorkingPrecision -> MachinePrecision, …`).
  Models get option names wrong far more often than formulas, and this answers from the kernel.
- `$HistoryLength = 0` when the bridge loads, so a long-lived session does not accumulate output
  history in memory.

## 1.9.1 — 2026-11-16

### Changed

- **`workspace/AGENTS.md` is now the single source of rules.** The template that `/initmath` copies
  carries everything a calculation session needs: a table of the `wolfram_*` and `pdfconv_*` tools
  with what each one is for, the PDFConv location and the `overwrite: true` rule, the FeynCalc +
  FeynArts load line, and the note that a project's own `AGENTS.md` wins. A machine-global
  `~/.dsh/AGENTS.md` with the same Mathematica rules is no longer required: a new machine needs
  only the plugins `dsh-wolfram-nb` and `dsh-pdfconv`.

## 1.9.0 — 2026-11-15

### Added

- **`wolfram_ready` tool.** Reports whether the current folder can take a task: workspace files
  (`AGENTS.md`, `tools/`), the environment count with the missing names, and the git repository
  (branch, commit count, dirty or clean). The workspace `AGENTS.md` now tells a session to call it
  at the start and to confirm readiness in the first reply — so a prepared folder opens with
  "environment ready, we can start" instead of silence.
- `/initmath` ends its report with `All good — ready for a task.` when every component is present.

## 1.8.1 — 2026-11-15

### Fixed

- **Double-clicking InitMath no longer races.** The chip ignores a click while a run is in flight
  (a module-level flag, so a re-render cannot forget it), and the host keeps a per-folder lock:
  the second call answers "already being prepared; this click was ignored".

### Added

- **Git LFS at init.** When `git lfs` is available, `initGitRepository` runs `git lfs install
  --local` and tracks `*.pdf`, `*.docx`, `*.png`, `*.jpg`, `*.jpeg`, `*.xlsx`, `*.svg`, `*.zip`,
  so reports and figures are stored as pointers; the report line says `LFS on`. Without git-lfs it
  says `no git-lfs: binaries go into plain git` instead of silently bloating the repository.
- **The environment check reports Git** (`git --version`, plus `+ git-lfs` when present), so a
  machine without git is visible before the first commit fails.

## 1.8.0 — 2026-11-15

### Added

- **`/initmath` initializes a local git repository** in the prepared folder: `git init`, the
  initial commit of `AGENTS.md`, `tools/`, `tasks/` and `data/`, `core.autocrlf=false`, and the
  commit hash in the report (`Git  initialized (commit edded85)`). Pass `--no-git` to skip it, and
  an existing repository is left untouched. Identity falls back to `DSH <dsh@localhost>` only when
  git has no `user.name`, so a machine without a global git identity still gets its first commit.
- **`/mathsave [message]`** — stages everything in the session folder and commits it, printing
  `committed N file(s) as <hash>` or `nothing to commit`. This is the cheap safety net that keeps a
  session from losing its files.
- `scaffold.js` gained `--no-git`, prints the git line, and exports `initGitRepository()` /
  `gitSnapshot()` (covered by a test).

## 1.7.3 — 2026-11-15

### Fixed

- **The InitMath chip now shows its report.** The inline flash lived in component state, and the
  input bar re-renders (and re-injects the slot) while the command runs, so the result vanished
  unseen. The report is kept outside the component now and rendered in a popover anchored above
  the chip: full multi-line text, "Close" button and Escape to dismiss, still open after a
  re-render.

### Note

- Posting the result into the conversation is not available to plugins: DSH documents that a UI
  action calls a Host entry point through `ctx.remote.commands.execute()` and shows the returned
  result itself, and it exposes no API to append a message to a session.

## 1.7.2 — 2026-11-15

### Added

- **`/initmath` reports the environment** after scaffolding: Mathematica kernel, PDFConv, Python,
  MiKTeX and Node, each with the path it found — `env 5/5 OK`, or `Missing: Python, MiKTeX`.
  The chip shows that summary line and the full list on hover; the command is still `error` when
  something is missing, so a broken machine is not reported as success.
- **`/mathcheck` command** — the same report without touching any files.
- `scaffold.js` prints the report after preparing a folder; `checkEnvironment()` is exported and
  covered by a test.

## 1.7.1 — 2026-11-15

### Added

- **An `InitMath` chip in the composer**, next to Compact (slot `conversation.input.left`,
  order 46). One click runs `/initmath` for the current session folder and flashes the result
  ("Prepared … / 11 file(s) written" or the error) for a few seconds — no typed command and no
  token spent. Registered the same way `dsh-compact-suite` registers its chips.

### Tests

- `test/client.test.mjs` loads `client.js` in a stub DOM, checks the chip registration and that a
  click calls the host command channel with `/initmath`.

## 1.7.0 — 2026-11-15

### Added

- **`/initmath` command.** Prepares a calculation folder from the composer: copies the workspace
  template (`AGENTS.md`, `NOTES.md`, `README.md`, `.gitignore`, `tools/`) and creates `tasks/`
  and `data/`. Without an argument it prepares the session folder; a folder inside the plugin
  repository is refused, because calculations must not mix with the code.
- **`InitMath.cmd` and `scaffold.js`.** The same scaffolding from a double-click (Windows) or the
  command line: `node scaffold.js "D:\work\my-task" [--force]`. Existing files are kept unless
  `--force`.
- **The workspace template ships in the package** (`files` now lists `workspace` and
  `scaffold.js`), so `/initmath` works on an installed copy, not just in the repository. The
  template stores its ignore file as `workspace/gitignore` because npm strips `.gitignore`;
  `scaffold.js` renames it on copy.

## 1.6.9 — 2026-11-14

### Corrected

- **`ClearAll["*"]` does not clear the bridge.** The 1.6.6 note claimed it did; a live check after
  the 1.6.8 release showed `WolframBridge`` keeps its definitions, because the context is not on
  `$ContextPath` and `ClearAll["*"]` only matches symbols there. The README limitation and the
  watchdog message were corrected; the watchdog stays, as a kernel that never reads its input is
  still possible (a hung process, a blocked stdin).

## 1.6.8 — 2026-11-14

### Added

- **Start watchdog.** The kernel prints `@@WB_BEGIN@@` before it evaluates anything, so a missing
  marker means it never read the request: stuck inside a library call, or its bridge was wiped by
  `ClearAll["*"]`. That case used to burn the whole evaluation timeout; it now fails after 5–20 s,
  restarts the kernel and says why.
- **`scripts/smoke.mjs`.** Boots the plugin the way a session does and walks every tool once
  (11 steps, ~10 s); use it to accept an installed build.

### Tests

- `Exit[0]` in a cell is reported as a kernel exit and the next call recovers on a fresh kernel
  (37 cases total).

### Documentation

- Both READMEs no longer claim that every evaluation writes a `.nb`; the export is opt-in since
  1.6.3.
- Development notes cover `npm test`, the smoke script, the `package.json` guard and
  `DSH_WOLFRAM_ALLOW_BRIDGE_MISMATCH`.

## 1.6.7 — 2026-11-14

### Added

- **`DSH_WOLFRAM_ALLOW_BRIDGE_MISMATCH=1`** keeps a kernel whose `bridge.wl` version differs
  from the host's expectation. While developing the plugin the two files are installed in
  separate steps, and the running host can be one version ahead; with the flag the kernel starts,
  `wolfram_notebook status` names the mismatch, and no restart dance is needed.

### Changed

- `wolfram_render` documents that the expression is evaluated in the session kernel, so it can
  render a graphics value defined by an earlier `wolfram_eval` (`expr="fig"`).
- `build-tgz.bat` refuses to pack a `package.json` that is not clean UTF-8 JSON. A BOM written by
  PowerShell's `Set-Content` used to produce a tgz that `dsh plugin add` rejected only after
  touching the profile.

## 1.6.6 — 2026-11-14

### Fixed

- **A replaced kernel's exit no longer fails the next call.** `dispose()` kills the old process
  ~400 ms later, and its `exit` event rejected every waiter — including the call that had already
  started on the fresh kernel ("Wolfram kernel exited (code 0)." right after a timeout or
  `wolfram_notebook action=reset`). The handler now ignores a child that is no longer current.

### Documentation

- `wolfram_render`, `wolfram_state` and `wolfram_verify` retry a marked call once; the retried
  calls are idempotent (they overwrite a file or read state), which is why the retry is safe.
- `ClearAll["*"]` (every context, unlike `ClearAll["Global`*"]`) also drops the bridge symbols.
  The session then stalls until the call times out and the kernel is recreated; definitions are
  lost anyway, so this is documented rather than guarded.

## 1.6.5 — 2026-11-14

### Fixed

- **Deeply nested results no longer hang on MathML.** A leaf budget is not enough: `Nest[List, 1, 400]`
  has only 401 leaves but depth 400, passed the check and kept `ExportString[.., "MathML"]` busy for
  minutes (depth 100 converts in 0.09 s, depth 200 already does not finish). Typesetting now also
  requires `Depth[value] <= $maxTypesetDepth` (64).

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
