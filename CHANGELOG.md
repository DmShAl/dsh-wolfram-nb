# Changelog

## 1.16.7 — 2026-11-19

### Added

- **`path` on `wolfram_eval` and `wolfram_job`.** Both accept `path` (absolute or relative to the
  workspace) instead of `code`/`cells` and run `Get[<file>]` in the kernel, so a task's `code.wl`
  needs no manual escaping; exactly one of `code`, `cells`, `path` is allowed, the file must exist
  and end in `.wl`, and the validation happens before a kernel is started. A job submitted with
  `path` defaults its title to the file name, and the full log/`result`/`log` behave as before.
- **`deep: true` for `wolfram_ready`.** Beyond the existing components it imports and versions the
  Python packages (numpy, scipy, mpmath, sympy, pymupdf, python-docx) in a separate process and
  reports the installed Mathematica packages (MaTeX, FeynCalc, FeynArts, xAct) with paths and
  paclet versions; optional packages are listed but never turn `ok` false. The plain call is
  unchanged.
- **Snapshot retention and deduplication.** `version-snapshot.mjs` keeps the newest 20 snapshots by
  default (`--keep N` or `DSH_SNAPSHOT_KEEP`), removes only directories named
  `YYYY_MM_DD-HH_MM_SS[-N]`, and skips a snapshot whose content (paths + bytes) equals the latest
  one (`snapshot unchanged`); `--force` creates it anyway. `snapshot.cmd` and `build-report.cmd`
  forward `--keep` (`build-report --keep N`).
- `*.latex.log` is ignored by the workspace `.gitignore` (a build artifact); `_versions/` stays
  unignored on purpose.

### Changed

- **`wolfram_job status` is short by default**: state, elapsed time, the last 4 progress lines and
  the log path; `verbose: true` restores the previous 10-line progress list. `log`/`result` are
  unchanged.

### Tests

- 76 tests: `path` for eval and job (including a missing file and the `code`+`path` conflict),
  deep `wolfram_ready`, `probePythonModules` with a missing module, snapshot dedup/`--force`/
  `--keep` with an unrelated directory, short vs verbose job status.

## 1.16.6 — 2026-11-19

Task versions and the `check-report` render location. Bridge unchanged (1.3.5).

### Added

- **Task versions in `_versions/<YYYY_MM_DD-HH_MM_SS>/`** (local time, sorts
  lexicographically). `tools/version-snapshot.mjs` copies `TASK.md`, `report.md`/`report.tex`,
  every `*.wl` in the task root, `report.pdf`, `report.docx` and `_plots/` (recursively); it
  skips `_work/`, `_data/`, `_versions/` and hidden service directories, adds `-2`, `-3` when two
  snapshots fall into one second, prints the created directory, and does not create an empty
  `_versions/` when there is nothing to copy.
- **`tools/snapshot.cmd <task-dir>`** — manual snapshot before editing `code.wl`/`report.md`.
- **`build-report.cmd` snapshots after a successful build** — one directory per source directory
  per call, printed after the conversion; `--no-snapshot` disables it for that run. Canonical
  `report.md/.pdf/.docx` and `code.wl` stay current; failed conversions create no snapshot.
- `workspace/AGENTS.md` «Версии задачи», `tools/README.md` and `workspace/README.md` describe the
  new workflow; `task-template.md` mentions `_versions/`; both READMEs got a quickstart line.
  `_versions/` is deliberately not added to `.gitignore` — the user decides what to commit.

### Fixed

- **`check-report.cmd` no longer drops `page1.png` next to the report.** The default is now
  `--pages 1 --out "<pdf-dir>\_work"`; explicit arguments are forwarded unchanged.
- **`build-report.cmd`: `shift` in the argument loop also shifted `%0`**, so `%~dp0` resolved to
  the report's directory instead of `tools\`; the script directory is captured before parsing.
- **`build-report.cmd`: an unescaped `)` inside `echo` closed the `--no-snapshot` block**, leaving
  `exit /b 0` unconditional — the snapshot code was skipped and `--no-snapshot` printed a broken
  message.

### Tests

- 71 tests: `version-snapshot` copies the expected files, never overwrites the first snapshot,
  skips `_work/`, and creates no directory when there is nothing to copy.

## 1.16.5 — 2026-11-19

Math-workflow release: less manual routine per task, standard checks. Bridge unchanged (1.3.5).

### Added

- **`tools/new-task.mjs --title "…"` and `report.md`.** The command now creates `TASK.md`,
  `report.md` (from `report-template.md`, title substituted), `code.wl`, `_plots/` and `_work/`;
  `--title` sets the heading in `TASK.md` and `report.md` (default: the task name). It prints every
  created file, refuses an existing task directory and keeps the old `node tools/new-task.mjs <name>`
  form working.
- **`code.wl` skeleton with six sections**: preparation (`taskDir` from `$InputFileName`, falling
  back to `Directory[]`), parameters, symbolic solution, numeric check, figures exported into
  `_plots/`, final `Print`. The comments show `Assuming`, `NIntegrate` and `Export[...,
  FileNameJoin[{plotsDir, "fig1.png"}]]`; `Get["code.wl"]` works from any directory.
- **`tools/python.cmd`** — Python 3.14 by absolute path (`DSH_PYTHON` overrides with an absolute
  path), clear error when missing; used as `tools\python.cmd -c "…"` or `tools\python.cmd script.py`.
- **`tools/check-report.cmd <report.pdf>`** — verifies that `report.docx` sits next to the PDF,
  then runs `pdfcheck.cmd` (default `--pages 1`) and forwards its exit code; missing PDF/DOCX → 1,
  missing `pdfcheck` → 2.
- **`workspace/tools/README.md`** — a short table of all six tools.

### Changed

- **`task-template.md`**: new «Проверки» checklist (`wolfram_check`, `wolfram_verify`, independent
  Python/MC check, `pdfcheck`, `check-report`) and an «Артефакты» section with the report paths.
- **`report-template.md`**: a real figure example `![Краткая подпись](_plots/fig1.png){width=90%}`
  with the caption rule (alt text is only the caption; LaTeX/PDFConv adds «Рис. N», do not start
  alt with it) and an optional «Проверки» table (symbolic / numeric-MC / independent Python /
  PDF check).
- **`workspace/AGENTS.md`**: new «Чек-лист математической задачи» (ten steps from `TASK.md` to
  `git commit`), `python.cmd`/`check-report.cmd` in the tool tables, `mpmath`/`sympy` in the
  Python stack, and `--title` in the task-scaffold line.
- **Docs**: root `AGENTS.md` (mpmath/sympy, new tools), `README.md`/`README.en.md` quickstart
  lines for `new-task --title`, `python.cmd` and `check-report.cmd`.
- All `.cmd` files are ASCII (cp866-safe) with CRLF and no BOM; Python is always the absolute
  Python 3.14 path.

### Tests

- 70 tests unchanged; smoke 14/14. Manual checks: scaffold in a temp folder with `--title`,
  `wolfram_check` on the generated `code.wl` (no Fatal), `python.cmd -c "import mpmath, sympy"`,
  `check-report.cmd` with and without the DOCX, and the repository grep for forbidden Python
  launchers.

## 1.16.4 — 2026-11-19

### Fixed

- **`SyntaxWarning` from `workspace/tools/pdfcheck.py` on Python 3.14.** The module docstring
  contains the pinned interpreter path `C:\Tools\Scripts\Python314\python.exe`; in a normal
  string `\T` is an invalid escape sequence, so Python 3.14 printed
  `SyntaxWarning: "\T" is an invalid escape sequence` (and will make it an error). The docstring
  is now a raw string (`r"""`), its content is unchanged. Verified with
  `-W error::SyntaxWarning -m py_compile` (exit 0) and `pdfcheck.cmd` (no warning in stderr).
  Bridge unchanged at 1.3.5.

### Tests

- 70 tests unchanged — this release touches only a docstring; `npm test` and smoke stay green.

## 1.16.3 — 2026-11-19

### Changed

- **Python is pinned to 3.14 by absolute path (bridge unchanged, 1.3.5).** The `py` launcher
  resolves to a bare 3.15 installation on this machine (no scientific stack), while 3.14 with
  numpy/scipy/pandas/matplotlib/pymupdf lives at `C:\Tools\Scripts\Python314\python.exe`. Every
  Python run in the repository now uses that absolute path — no `py`/`pyw` launcher and no PATH
  lookup:
  - `workspace/tools/build-report.cmd`, `extract-md.cmd`, `pdfcheck.cmd` set
    `PY=C:\Tools\Scripts\Python314\python.exe` (an absolute `DSH_PYTHON` overrides it) and stop
    with a clear message when the interpreter is missing, instead of falling back to `python`;
  - `scaffold.js checkEnvironment` reports the Python path without a PATH fallback and rejects a
    relative `DSH_PYTHON`; `findOnPath` is kept for `pdflatex` only;
  - docs: root and `workspace/AGENTS.md` (new rule "Python — only the absolute 3.14 path"),
    `README.md`, `README.en.md`, `examples/lorenz-example/TASK.md`, `pdfcheck.py` docstring.

### Tests

- 70 tests: `checkEnvironment` must report the fixed Python 3.14 path (or an explicit
  `DSH_PYTHON` absolute-path error), never a PATH candidate.

## 1.16.2 — 2026-11-19

### Fixed

- **ASCII-safe marker transport (bridge 1.3.5).** Marker payloads (`@@WB_CHECK@@`,
  `@@WB_VERIFY@@`, `@@WB_STATE@@`, `@@WB_RENDER@@`, `@@WB_HELP@@`, `@@WB_DOCPAGE@@`,
  `@@WB_ALPHA@@`) were printed as raw JSON to stdout. `ExportString[..., "JSON"]` maps UTF-8
  bytes to Latin-1 characters, which `WriteString` re-encodes, so a Cyrillic identifier in a
  `wolfram_check` message arrived as mojibake: `Unexpected letterlike character: "Ð"
  (\:041f)` instead of `"П"`. The bridge now has `WolframBridge`jsonPayload` (base64 of the JSON
  bytes, the same trick the document channel always used) and every marker uses it; the host
  decodes base64 before `JSON.parse` and still accepts a raw JSON payload from an older kernel.
  Runtime behaviour of A1–A6 (UTF-8 kernels, full job logs, `fullConsole`, `wolfram_check`
  counters/`strict`) is unchanged.

### Tests

- 69 tests: a `wolfram_check` regression that requires `"П" (\:041f)` and `"ш" (\:0448)` in the
  messages and rejects the mojibake (`"Ð"`/`"Ñ"`), with the counters unchanged.

## 1.16.1 — 2026-11-19

Follow-up to the 1.16.0 acceptance (bridge stays 1.3.4; these are host-side fixes).

### Fixed

- **`wolfram_check` counters are consistent with the tag tally (B2).** The findings array is capped
  for JSON, but the header, `Hidden` and `more` numbers now come from the full tag tally:
  `hidden = sum of SCRIPT_NOISE tag counts`, `visibleTotal = count − hidden`, `limit` applies to
  display only, and `ok` is `visibleTotal === 0`. A task script with 807 findings used to report
  "no issues (500 script-mode finding(s) hidden)" while `Tags:` added up to 807; `strict: true`
  now shows the full count (capped findings raised from 500 to 2000, well above the display limit).
- **One truncation marker in a job summary (B1).** `[console truncated: N chars total]` was added
  both by `describeDocument` and by `startJob`; `startJob` no longer adds a second one.
- **One log path line in `wolfram_eval` (B3).** The summary printed both `Full log:` and
  `Full console:` for the same `.dsh-wolfram/tmp/last-console.log`; it now prints `Full log:` once.
- **`TopLevelCompoundExpression` is script-mode noise (B4).** A normal standalone script such as
  `Print["Привет"]; g[x_] := x^2 + 1` reported one visible Remark and `ok: false`; the tag is now
  hidden by default like the other script-mode noise and still shown by `strict: true`.
  `UnusedParameter` stays visible — it is a useful signal.

### Tests

- 68 tests: counters add up on a large finding set (840 hidden instead of the old 500, visible 2,
  strict total matches `Tags:`), a plain standalone script is clean, one truncation marker per job,
  one log path line per eval.

## 1.16.0 — 2026-11-19

### Fixed

- **UTF-8 in every kernel (bridge 1.3.4).** A Russian Windows kernel defaults to
  `WindowsCyrillic`: `Get` of a UTF-8 `.wl` without BOM returned mojibake, `Print` of Cyrillic
  wrote `????` to the console, and a job that read `code.wl` in the wrong encoding exported a
  PNG with broken labels. `bridge.wl` now sets `$CharacterEncoding = "UTF-8"` and the `$Output`
  encoding during initialisation, before `@@WB_READY@@`, so session, job, batch and verify
  kernels all start correct. `DSH_WOLFRAM_CHARACTER_ENCODING` overrides the default.
- **The full job console is never lost.** Every finished job (success, failure or cancel) writes
  its whole console to `.dsh-wolfram/jobs/<id>.log` and the summary carries `Log: …`; when the
  inline console is cut at 1500 characters the summary says `[console truncated: N chars total]`
  instead of silently dropping the end. A 120-line `Print` loop used to end at `line 35` with no
  trace of `END-OF-JOB`.
- **`wolfram_eval` keeps a long console** in `.dsh-wolfram/tmp/last-console.log` and says so;
  `fullConsole: true` returns the whole text.
- **`wolfram_batch` keeps a per-item console** in `.dsh-wolfram/batch/<run>/item-<n>.log` and
  prints the path on each line, because the answer truncates every item to 800 characters.
- **`wolfram_check` is signal instead of noise.** Script mode hides `SuspiciousSessionSymbol`
  and `NonASCIICharacter` by default (Print/Set/Clear and Cyrillic strings in a standalone script
  are normal — a task script produced 970 findings, almost all of them this noise), shows per-tag
  counters and how many were hidden; `strict: true` returns everything. `limit` applies after
  filtering, and the schema now accepts `code` **or** `path` instead of requiring `code`.

### Added

- `wolfram_job action="log"` — reads the log file (`maxChars`, default 20000, or `tail: N` lines);
  `action="result"` accepts `full: true` to append the complete console; `action="status"` shows
  the log path.
- Three smoke steps (UTF-8 console, job log, check script mode) — 14/14.

### Documentation

- `README.md`, `README.en.md`: the UTF-8 mode and its override, the job log (`action="log"`,
  `full: true`), `wolfram_check strict`, the new data locations.
- `workspace/AGENTS.md`: UTF-8 is the normal mode (no `Block[$CharacterEncoding]` or BOM
  workarounds), jobs keep their full log, `.dsh-wolfram/` layout updated.

### Tests

- 66 tests, five new: UTF-8 console and `Get` of a UTF-8 `.wl`; a long eval console on disk and
  `fullConsole`; a job's full log, `action="log"` and `full: true`; a job reading a UTF-8 source
  and exporting a PNG with a Cyrillic label; `wolfram_check` hiding script noise while reporting
  a syntax error, with `strict` showing everything.

## 1.15.0 — 2026-11-18

### Changed

- **Russian panel interface.** `client.js` registers an `ru` dictionary next to `en` and `zh`: the
  tab, the empty state, the notebook picker, the "Kernel / updated" labels, the parse and timeout
  messages, the "Подготовить" chip and its popover. The cell count is inflected
  ("1 ячейка / 3 ячейки / 5 ячеек") — `meta.cells` carries three plural forms separated by `|`.
  The dictionary is chosen by the DSH interface language, so the Chinese labels appeared because
  the active language was Chinese; with the language switched the plugin follows it.
- **Plugin metadata for the Russian locale** — `locale/ru.json` (`meta.title`, `meta.description`).
- **Documentation in Russian.** `README.md` is rewritten and current (1.15.0, the new tool
  parameters, install through `build-tgz.bat install` with the remove step, `main` branch, 61
  tests). The Chinese text of the upstream project is kept as `README.zh.md` with a notice;
  `README.en.md` is updated and points at the Russian primary. `RELEASING.md` is rewritten for the
  local release flow actually used here (build, install, tag, push; no npm publishing), and
  `INSTALL.md` documents the remove-then-add step, the version check and the unattended
  `InitMath.cmd`.
- **Repository metadata** — `homepage`, `repository` and `bugs` in `package.json` point at
  `DmShAl/dsh-wolfram-nb`; the upstream npm package is mentioned in the README text only.

### Tests

- 61 tests: two client tests check that `ru` has exactly the keys of `en`, that it contains no
  Chinese characters, that `meta.cells` has three forms, and that `locale/ru.json` is filled in.

## 1.14.0 — 2026-11-18

### Added

- **`wolfram_job action="result"` waits when asked.** `wait` (seconds, up to 300) blocks until the
  job finishes and returns its output, so a long computation costs one call instead of a poll loop.
- **`wolfram_check` inspects a file.** `path` reads a task's `code.wl` (or any file) instead of
  inline `code`, and the answer names the inspected file.
- **`wolfram_alpha` has `maxChars`** (default 4000, max 20000) and says when the answer was clipped,
  instead of silently returning up to 12 000 characters.
- **`wolfram_notebook action="status"` reports the plugin version** next to the bridge version, so
  it is obvious whether a restart actually loaded the new build.

### Changed

- **`wolfram_help` is compact.** The exact match keeps its usage, syntax and options (12 at most);
  the neighbouring matches are one line with the first sentence, because a broad query such as
  `Plot` used to print 12 options for each of 5 symbols. `options: false` drops the option list
  completely, and defaults are rendered with `InputForm`, so `1/GoldenRatio` no longer breaks the
  block with a three-line fraction.

### Tests

- 59 tests: compact help and `options: false`, the plugin version in the status line, `wait` on a
  job result, and `wolfram_check path`.

## 1.13.3 — 2026-11-18

### Changed

- **A fresh workspace starts on `main`.** `/initmath` ran plain `git init`, which on this machine
  produced `master` while the repositories the workspace is pushed to use `main`; it now asks for
  `git init -b main` and falls back to the old default when git does not know the flag.
- **`InitMath.cmd` runs unattended when a folder is passed.** The script paused at the end even
  for `InitMath.cmd "D:\path"`, so a script or an agent calling it waited for a keypress; the
  pause now belongs to the interactive (no-argument) path only.

### Added

- **`wolfram_help` is no longer a dead end.** A query with no kernel symbol match points at
  `wolfram_doc`, because file formats, guide pages and messages are not symbols.
- **`wolfram_state action="symbols"` explains string patterns.** A regex-looking pattern
  (`Global`*[A-Z]*`) matches nothing and now says that `Names[]` takes Wolfram string patterns,
  not regular expressions.

### Tests

- 55 tests: the workspace branch is `main`, the zero-match hint, the pattern hint.

## 1.13.2 — 2026-11-18

### Fixed

- **`wolfram_state action="load"` without `path` actually loads.** It stamped a fresh timestamp
  into the filename, so a load without a path could never find a file; it now restores the
  newest `.dsh-wolfram/state-<timestamp>.mx` (a user-chosen name such as `state-test.mx` is not
  "the last save").
- **`wolfram_ready` says what is missing.** It used to answer "no AGENTS.md/tools" even when
  `AGENTS.md` was present, and in the plugin repository it now says that this is not a
  calculation folder instead.
- **No leftover request files.** A timeout, a kernel restart or a failed write never reached the
  cleanup branch, so `.dsh-wolfram/tmp` collected a `req-*.json` per failed call; the files are
  now removed when the call settles.
- **`/initmath` refuses the checkout from an installed plugin.** The check compared the target
  with the *running* package directory, which in an installed copy lives in `node_modules`; the
  repository is recognised by its `package.json` in an ancestor instead, so calculations still
  cannot be started inside it.

### Changed

- Operators that Mathematica 15 stores in the private use area are transliterated too:
  `\[Distributed]` (`x~dist`), `\[Conditioned]`, `\[Sum]`, `\[Product]`, `\[Limit]`,
  `\[CenterEllipsis]`, thin/invisible spaces and the Greek alphabet (`\[Omega]` → `omega`,
  `\[CapitalSigma]` → `Sigma`). A sweep of 63 built-in usage messages now contains no
  dropped character.

### Tests

- 52 tests: state save/load round-trip without a path, the `wolfram_ready` wording, no request
  file after a timeout, `x~dist` in `Probability` and `x->` in `Limit`.

## 1.13.1 — 2026-11-18

### Fixed

- **Script boxes with options.** `UnderoverscriptBox` carries
  `LimitsPositioning -> ...` after its three positional arguments, so matching exactly three
  dropped the island: the `Sum` usage text lost its formula and was marked degraded. The
  sub/superscript and over/underscript rules now accept trailing arguments.
- **A missing usage message is not degradation.** `Table`, `Tooltip` and `TimeSeries` have no
  `::usage` in the kernel; `wolfram_help` no longer warns "usage: degraded" for them.

## 1.13.0 — 2026-11-18

### Fixed

- **Operators survive the flattening.** Mathematica 15 keeps several operators in the private
  use area (`\[Equal]` is U+F431, `\[Rule]` U+F522, `\[RuleDelayed]` U+F51F, `\[LongEqual]`
  U+F7D9), and the transliteration step dropped every non-ASCII character — so `wolfram_doc`
  answered `{{uf},...}` and `u[x_1]a` instead of `{{u->f},...}` and `u[x_1]==a`, and usage text
  could lose the same symbols. Characters are now resolved through their names (`Equal` →
  `==`, `Rule` → `->`, ...), so no code point is written down and a version that moves them
  again keeps working.
- **`TemplateBox` content is actually flattened.** `wuFlat` is `HoldAllComplete`, so the old
  `wuFlat[First[args]]` never evaluated `First` and fell through to the unknown-head rule: every
  reference-page cell with an inline link or a template box was dropped whole. The details pages
  now flatten completely (DSolve 6 → 19 cells, Plot 33 → 38, Dataset 76 → 77).
- **More boxes are understood**: `FrameBox`, `OverscriptBox`, `UnderscriptBox`,
  `UnderoverscriptBox`, integer arguments (example jump links). Decorative `GraphicsBox` and
  interactive controls flatten to an empty string instead of failing the cell.

### Added

- **Page cache in `wolfram_doc`.** A flattened page is kept per symbol (64 entries, 6000
  characters each), so a second call for the same symbol is instant; `maxChars` only slices the
  reply.
- **All reference-page sections are searched**, not just `Symbols/`: formats (`CSV`, `PNG`),
  messages and the other sections live in sibling directories and used to answer "no page".
- `wolfram_doc` reports how many detail cells could not be flattened, instead of silently
  dropping them.

### Tests

- 49 tests: usage text keeps `pos_1->v_1`; the DSolve page keeps `u->f` and `u[x_1]==a` without
  degraded cells and is served from the cache on the second call; a `Formats` page resolves.

## 1.12.1 — 2026-11-18

### Fixed

- **`wolfram_doc` includes the tables.** Detail pages introduce tables with a lead-in ("The
  following wrappers w can be used for the f_i:") and put the content into `2ColumnTableMod` /
  `3ColumnTableMod` cells; without them the notes were dangling sentences. Table rows are now
  flattened with `" - "` inside a row and `"; "` between rows, and the child `TableText` cells are
  not collected twice.

## 1.12.0 — 2026-11-18

### Added

- **`wolfram_doc` — the local reference page.** Mathematica ships its documentation on disk
  (`%LOCALAPPDATA%\Programs\Common\Wolfram Research\Documentation.en-us\<version>\Documentation\English`,
  7007 `.nb` pages, 12.6 GB here), so the tool reads the page of a symbol, flattens its "Notes"
  cells with the same box flattener and returns the details text — offline, version-exact,
  ~0.25 s per page (the import of an 11 MB page took 0.23 s).

### Changed

- `wuFlat` learned `TextData` (prose cells mix strings and inline cells) and flattens
  `TemplateBox` by its first argument (the displayed content), which the reference pages need.

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
