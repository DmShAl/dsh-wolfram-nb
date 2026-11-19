# Wolfram Notebook for DeepSeek Harness (`dsh-wolfram-nb`)

> This build is documented primarily in Russian: [README.md](README.md). The Chinese text of the
> upstream project is kept in [README.zh.md](README.zh.md) and may lag behind the code.

[![topic: dsh-plugin](https://img.shields.io/badge/topic-dsh--plugin-0b7285)](https://github.com/topics/dsh-plugin)
[![license: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**English** · [Русский](README.md) · [简体中文](README.zh.md)

![Wolfram Notebook for DeepSeek Harness](assets/social-preview.png)

> **A DeepSeek Harness plugin** that turns a locally installed Mathematica into an agent-callable
> tool, and renders the Wolfram notebook live beside the conversation.

Turns your locally installed Mathematica into a first-class tool of DeepSeek Harness: the agent calls
Wolfram Language the same way it calls any other tool, and the results render in a notebook panel on
the right side of the conversation.

> **Independence notice.** This plugin is not affiliated with, nor endorsed by, Wolfram Research.
> **Mathematica** and **Wolfram Language** are trademarks of Wolfram Research, Inc. The plugin ships
> no Wolfram software or resources; you must install and license Mathematica yourself.

## Install and distribution

This fork is built and installed locally (version 1.16.4, bridge 1.3.5):

```bat
build-tgz.bat            :: build the tarball
build-tgz.bat install    :: build and install it into the desktop profile
```

`build-tgz.bat install` removes the previous version first: pnpm otherwise keeps the files of an
older build when the version number did not change. Restart DSH completely afterwards. Check with
`wolfram_notebook action="status"` (`Plugin 1.16.4, bridge: 1.3.5`) or `node scripts/smoke.mjs`
(14/14).

**From a clone:** install the clone directory as a bundle with
`plugin_manager install_bundle target=<absolute path to the clone>`. The npm package
`nashihang777-dsh-wolfram-nb` is the upstream project, not this build. See [INSTALL.md](INSTALL.md)
for the local flow.

The target machine needs Windows and a REPL-capable `math.exe` (Mathematica, or a Wolfram Engine
installation that ships one). Report building uses Python **3.14** by absolute path
(`C:\Tools\Scripts\Python314\python.exe`); the scripts have no `py` launcher and no PATH fallback,
because that launcher resolves to 3.15 (without the scientific stack) on this machine.

The release flow for this fork (version bump, tests, build, tag, push) is documented in
[RELEASING.md](RELEASING.md).

## Capabilities

| Capability | Detail |
|---|---|
| `wolfram_eval` | Evaluates arbitrary Wolfram Language in a persistent local kernel (one or many cells): symbolic algebra, calculus, equation solving, matrices, units, data handling, file import/export, and more. A long console is cut at 1500 characters and kept whole in `.dsh-wolfram/tmp/last-console.log`; `fullConsole: true` returns it in full |
| `wolfram_notebook` | `open` renders an existing `.nb`; `reset` restarts the kernel; `status` reports kernel state |
| `wolfram_job` | `submit` runs a long computation in its own kernel (30 min default); `status`/`result`/`cancel`/`log`/`list` manage jobs, `status` shows the latest `Print` output, `result` accepts `wait` (up to 300 s) and `full: true` (whole console), `action="log"` reads the log. Every finished job always writes `.dsh-wolfram/jobs/<id>.log` and the path is in the summary; graphics results are published to the panel |
| `wolfram_verify` | Independent checks in a throwaway kernel (session definitions cannot skew them): `identity` proves `FullSimplify[lhs-rhs, assumptions]` symbolically, then samples numerically; `ode` simplifies the residual and checks optional initial/boundary `conditions`; `integral` compares with its closed form; `antiderivative` differentiates the claimed antiderivative. Each result carries `status`: `verified_symbolic` / `numerically_consistent` / `falsified` / `inconclusive` |
| `wolfram_alpha` | Asks Wolfram|Alpha a natural-language query and returns the answer; with `steps` (default `true`) it requests the step-by-step solution when the service offers one and falls back to the plain answer otherwise; `maxChars` (default 4000) caps the answer and says when it was clipped. Requires internet access |
| `wolfram_state` | `status` reports Global symbols, memory, `$Assumptions` and packages; `symbols` lists defined symbols (no temporary `$` names); `save`/`load` persist the Global context (load defaults to the newest save); `clear` drops it |
| `wolfram_render` | exports `Plot`/`Graphics` to PNG/SVG/PDF/JPG with `ImageResolution`, creating the directory, auto-loading MaTeX when the expression uses it |
| `wolfram_batch` | runs independent snippets in parallel kernels (`maxParallel`, up to 12 items) and reports OK/FAILED per item |
| `wolfram_ready` | Reports whether the folder can take a task: `AGENTS.md`/`tools` (naming what is missing), the toolchain, and the git repository state; the plugin repository is reported as not a calculation folder |
| `wolfram_check` | Static inspection with CodeInspector before running: syntax errors and suspicious constructs with line numbers; accepts inline `code` or a `path` to a file. Script mode hides `SuspiciousSessionSymbol` and `NonASCIICharacter` noise (Print/Set/Clear and Cyrillic text in a standalone script), shows per-tag counters and how many were hidden; `strict: true` returns everything. The code is never evaluated |
| `wolfram_help` | Symbol lookup in the running kernel: matches, readable usage text (box islands flattened without a front end), `SyntaxInformation` (`ArgumentsPattern`), attributes and the real option names with defaults; the exact match keeps the full block, neighbours stay one line, `options: false` drops the option list |
| `wolfram_doc` | Reads the local reference page of a symbol (the "Details" notes) from the installed documentation — offline and version-exact; the page is cached per symbol and every `ReferencePages` section is searched |
| In-panel notebook picker | The panel's “Open…” button lists the `.nb` files found in the workspace (root, `wolfram-notebooks/`, the current notebook's directory); click to render, or type a path |
| `/wolfram-open` command | Run `/wolfram-open <path>` in the composer to switch the panel without producing a model message |
| `/initmath` command | Prepare a calculation folder: copies `workspace\` (`AGENTS.md`, `tools\`), creates `tasks\` and `data\`, initializes a local git repository with Git LFS when available (first commit), then reports the environment (Mathematica, PDFConv, Python, MiKTeX, Git, Node); `--no-git` skips git; refuses the plugin repository |
| `/mathsave` command | Stage and commit the session folder to its local git repository (`/mathsave "message"`) |
| `/mathcheck` command | The same environment report without touching any files |
| `InitMath` button | Chip left of the composer (next to Compact): runs `/initmath` for the session folder and shows the full report (copied files + environment) in a popover, no model message |
| Right-side notebook panel | Renders titles, body text, input cells, MathML formulas, PNG graphics and messages beside the conversation |
| Persistent kernel | One long-lived `math.exe` per session; variables and definitions survive across calls |
| `.nb` export (opt-in) | Pass `exportNotebook: true` to also write the evaluation as a real Mathematica notebook file under `wolfram-notebooks/`; by default the panel renders the document and nothing is written to disk |

## Architecture

```
Host plugin (index.js)
  ├─ one `math.exe -noprompt` process per session
  ├─ bridge.wl: file-based JSON protocol (one file per request/response; stdout carries markers only)
  ├─ writes the result to .dsh-wolfram/latest.json (publishedAt, MathML, base64 PNG)
  ├─ wolfram_job: one extra math.exe per job, so a long run never blocks the session kernel
  └─ registers the wolfram_eval / wolfram_notebook / wolfram_job / wolfram_verify / wolfram_state / wolfram_render / wolfram_batch tools
Client plugin (client.js)
  ├─ registers the right-sidebar tab type `wolfram-notebook` (plus a guide entry)
  ├─ polls latest.json and refreshes on a new publishedAt
  └─ auto-reveal: calls ctx.sidebarRight.openTab when a new document appears
```

**Why a CLI kernel bridge instead of MCP?** An MCP server needs an extra paclet and process and
exposes a fixed tool set. Driving the kernel directly gives full control over the Mathematica
version, output formats (MathML/PNG/TeX), session state and the rendering document, with no extra
dependency — and the kernel is still a complete, interactive Wolfram session.

## Usage

From the agent side, just call the tool:

```
wolfram_eval  title="Basel problem"
cells=[
  {"type":"title","text":"Basel problem"},
  {"type":"input","code":"Sum[1/n^2, {n, 1, Infinity}]"},
  {"type":"input","code":"Plot[Sin[x]/x, {x, -10, 10}]"}
]
```

The panel opens automatically with the formulas and graphics. Nothing is written to disk by default;
to keep a `.nb` for further editing in Mathematica, add `"exportNotebook": true` to the request and
`wolfram-notebooks/<title>-<time>.nb` is written.

Render an existing notebook:

```
wolfram_notebook  action="open"  path="wolfram-notebooks/xxx.nb"
```

You can also switch notebooks inside the panel: click “Open…” at the top, then pick a `.nb` from the
list (or type a path) — the panel renders it immediately and makes it the current document.
`/wolfram-open <path>` is the command form of the same action and produces no model message.

### A calculation folder: `/initmath`

Do the maths outside the plugin repository, or results end up mixed with the code. A folder can be
prepared in three ways:

- from a session: `/initmath "D:\Projects\my-math"` (no argument means the session folder);
- from the repository: `InitMath.cmd "D:\Projects\my-math"` (double-click asks for the folder);
- directly: `node scaffold.js "D:\Projects\my-math"`.

It copies `workspace\` — `AGENTS.md` (the rules for a calculation session), `NOTES.md`, `README.md`,
`.gitignore` and `tools\` (report build, PDF check, task scaffold) — and creates `tasks\` and
`data\`. Existing files are kept unless `--force`, and a folder inside the plugin repository is
refused.

`AGENTS.md` from `workspace\` is self-contained: the rules for Mathematica, figures and reports
live in it, so a machine-global `~/.dsh/AGENTS.md` is not needed — a new machine only needs the
plugins `dsh-wolfram-nb` and `dsh-pdfconv`, then `/initmath`.

Next: `node tools\new-task.mjs <name>`, compute with the `wolfram_*` tools, build the report with
`tools\build-report.cmd`, check it with `tools\pdfcheck.cmd`. Session artifacts (`wolfram-plots\`,
`wolfram-notebooks\`, `.dsh-wolfram\`) are written to the session folder, never to the repository.

To open the panel manually: right sidebar “+” → Wolfram notebook (the panel registers a guide entry).

## Verifying and persisting results

```
wolfram_verify  action="identity"  lhs="Sin[x]^2 + Cos[x]^2"  rhs="1"  variables=["x"]
wolfram_verify  action="ode"  ode="y'[x] == y[x]"  solution="Exp[x]"  conditions=["y[0] == 1"]  range=[0, 1]
wolfram_verify  action="integral"  integral="Integrate[Exp[-a x^2], {x, 0, Infinity}]"  result="Sqrt[Pi]/(2 Sqrt[a])"  assumptions="a > 0"
wolfram_verify  action="antiderivative"  integrand="Sin[x]"  result="-Cos[x]"
wolfram_state   action="save"  path=".dsh-wolfram/derivation.mx"
wolfram_state   action="load"  path=".dsh-wolfram/derivation.mx"
wolfram_render  expr="Plot[Sin[x], {x, 0, 2 Pi}]"  format="svg"
```

If `Integrate`/`Solve`/`DSolve` returns itself unchanged, the summary names the likely
next step (`Reduce`, `NIntegrate`, `NDSolve`, ...). Use `wolfram_batch` for independent runs
(one kernel per item).

## Configuration

Override the row's `config` in the profile's `cordis.patch.yml`:

```yaml
- id: wolfram-notebook
  name: 'dsh-wolfram-nb'
  config:
    kernel: 'C:\Program Files\Wolfram Research\Wolfram\15.0\math.exe'
    timeoutMs: 180000
    idleMs: 1800000
    # kernelArgs: ['-pacletreadonly']   # optional
    # maxRunningJobs: 4                 # optional
```

| Field | Default | Meaning |
|---|---|---|
| `kernel` | auto-detect | Path to `math.exe`, the kernel's directory, or a product directory holding version subdirectories |
| `timeoutMs` | 180000 | Per-request timeout; on expiry the kernel is killed |
| `idleMs` | 1800000 | How long an idle kernel is kept before being reclaimed |
| `kernelArgs` | `[]` | Extra arguments passed to `math.exe`, e.g. `['-pacletreadonly']` to disable paclet auto-updates |
| `maxRunningJobs` | `4` | How many jobs may run at once; extra submissions wait in a FIFO queue |

`wolfram_eval` also accepts a per-call `timeoutMs` (milliseconds) that overrides the configured
default; timeout errors now include the kernel's last output lines.

### Kernel discovery order (works with non-default installs)

`kernel-discovery.js` tries the following in order and stops at the first REPL-capable hit:

1. Plugin config `config.kernel` (an exe, a kernel directory, or a product directory; if given it must be valid, otherwise the plugin reports an error)
2. Environment variables `WOLFRAM_KERNEL` / `MATHEMATICA_KERNEL`
3. Wolfram's own registry records:
   `HKLM/HKCU\SOFTWARE\Wolfram Research\Installations\*`, reading
   `ExecutablePath` / `InstallationDirectory` / `ProductVersion`, then taking `math.exe` from the same directory, newest version first
4. Standard layouts under `%ProgramFiles%`, `%ProgramW6432%`, `%ProgramFiles(x86)%`:
   `Wolfram Research\{Wolfram, Mathematica, Wolfram Engine, Wolfram Player}\<version>`
5. `math.exe` on `PATH` (common for Wolfram Engine)

So an install on `D:\Apps\Wolfram\15.1`, several side-by-side versions, or a Wolfram Engine all work
out of the box. Only a portable/manual copy with no registry record and a non-standard location needs
an explicit path:

```yaml
config:
  kernel: 'D:\Apps\Wolfram\15.1'
```

> The kernel host must be an interactive `math.exe` / `MathKernel.exe` (it reads expressions from
> stdin). `WolframNB.exe`, `wolfram.exe` and `WolframKernel.exe` are only used to locate the install
> directory and are never launched (`WolframKernel.exe -noprompt` does not serve stdin, as measured).
> Registry discovery is Windows-only; on macOS/Linux point `config.kernel` or `WOLFRAM_KERNEL` at
> `math`.

`wolfram_notebook action="status"` reports the kernel path actually used and how it was found, which
makes troubleshooting straightforward.

## Data locations

- `.dsh-wolfram/latest.json` — the document the panel renders (workspace, per session)
- `.dsh-wolfram/tmp/` — kernel request/response scratch files, plus `last-console.log` with the
  whole console of the last long `wolfram_eval`
- `.dsh-wolfram/jobs/<id>.log` — the complete console of every finished `wolfram_job`
- `.dsh-wolfram/batch/<run>/item-<n>.log` — the console of each `wolfram_batch` item
- `wolfram-notebooks/*.nb` — exported Mathematica notebooks (written only with `exportNotebook: true`)

## Encoding

Every kernel (session, job, batch, verify) starts with `bridge.wl`, which sets
`$CharacterEncoding = "UTF-8"` and the `$Output` encoding. A plain `Get` therefore reads a UTF-8
`.wl` without BOM, Cyrillic `Print` reaches the result intact, and labels on figures exported by a
job stay readable. Override with `DSH_WOLFRAM_CHARACTER_ENCODING` (for example `WindowsCyrillic`
for legacy files without an explicit encoding); the default is always UTF-8.

## Known limitations

- Interactive front-end constructs (`Manipulate`, `Dynamic`, the notebook UI itself) cannot be interactive on the web page; they render as static formulas or plain text.
- A few expressions (for example `Quantity`) have no MathML export; the panel falls back to `InputForm` text while the kernel still returns valid TeX.
- Graphics need the front end to rasterize; the first plot takes 1–3 seconds.
- Sessions sharing one workspace share `latest.json` (kernels stay per-session).
- After a page load, the first auto-reveal of the right sidebar needs one user gesture (or click “+” → Wolfram notebook); every later evaluation reveals and focuses the panel automatically.
- **Notebooks exported by early versions cannot be recovered**: the first implementation used `MakeBoxes` inside a `Module`, so output cells were written as `value$…` placeholders (`$` is part of the variable name, so the original value cannot be reconstructed). Recompute to generate a new notebook; the current version uses `ToBoxes` and is correct.
- With `strict: true`, CodeInspector's `NonASCIICharacter` message shows the character itself mangled (`"Ñˆ"` instead of `"ш"`); the code point in the message (`(\:0448)`) is correct. These remarks are hidden by default.

## Fix history

- **Output cells written as `value$…`** — `MakeBoxes` has `HoldAllComplete`, so `Module`'s local symbol was boxed verbatim. Export now uses `ToBoxes[value, StandardForm]` (evaluate, then box).
- **Graphics did not render when a `.nb` was reopened** — `GraphicsBox` stores box primitives, and converting them to MathML/text produced garbage. Import now uses `MakeExpression` to restore the `Graphics`/`Graphics3D`/`Legended` expression and re-rasterizes it to PNG; text and formula cells still go through MathML.
- **A cell with several statements broke the JSON export** — `ToExpression` with `HoldComplete` returns one argument per top-level expression, so `ReleaseHold` produced a `Sequence` that broke `ExportString[..., "JSON"]`. Such cells are folded into one `CompoundExpression`, and a `Sequence` value is kept as a list.
- **Grouped cells disappeared on import** — Mathematica stores input/output pairs in `CellGroupData`; the importer now flattens nested groups.

## Development notes

The `bridge.wl` protocol:

```
stdin:  WolframBridge`EvalFile["<path to request JSON>"];
stdout: @@WB_READY@@<version>
        @@WB_BEGIN@@<id>
        <lines produced by Print/messages during evaluation>
        @@WB_DOC@@<id>@@<response file path or base64>
```

Request JSON is written as pure ASCII (non-ASCII characters escaped as `\uXXXX`) and responses are
base64-encoded JSON, which avoids Windows console encoding differences. After editing `bridge.wl`,
run `wolfram_notebook(..., action="reset")` once or restart the kernel; after editing `client.js`,
reload the plugin (in this repository that is done by toggling its enabled state).

Tests and checks:

- `npm test` — 70 cases against the real kernel, about 129 s.
- `node scripts/smoke.mjs` — boots the plugin and calls every tool once (~10 s); use it to accept a
  build after installing. `--with-alpha` adds the Wolfram|Alpha call (needs a network).
- `build-tgz.bat` validates that `package.json` is clean UTF-8 JSON before packing: PowerShell's
  `Set-Content -Encoding utf8` adds a BOM, and `dsh plugin add` rejects such a tarball.
- While developing, `DSH_WOLFRAM_ALLOW_BRIDGE_MISMATCH=1` keeps a kernel whose `bridge.wl` version
  differs from the host's expectation (`wolfram_notebook action="status"` reports the mismatch).
- A kernel that does not answer `@@WB_BEGIN@@` within 5–20 s is treated as stuck and restarted; this
  covers `ClearAll["*"]` wiping the `WolframBridge`` definitions as well as a kernel stuck inside a
  library call, instead of waiting out the whole evaluation timeout.

## License and trademarks

- Licensed under [MIT](LICENSE). Version and fix history: [CHANGELOG.md](CHANGELOG.md).
- Not affiliated with or endorsed by Wolfram Research; **Mathematica** and **Wolfram Language** are its registered trademarks, used here descriptively only.
- The plugin ships no Wolfram software, paclets, documentation or brand assets; at runtime it drives the user's own licensed Mathematica. Deploying it as a multi-tenant compute service may conflict with Wolfram's license terms — that call belongs to the deployer.
