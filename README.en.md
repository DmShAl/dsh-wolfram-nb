# Wolfram Notebook for DeepSeek Harness (`@nashihang777/dsh-wolfram-nb`)

[![topic: dsh-plugin](https://img.shields.io/badge/topic-dsh--plugin-0b7285)](https://github.com/topics/dsh-plugin)
[![npm](https://img.shields.io/npm/v/@nashihang777/dsh-wolfram-nb?label=npm)](https://www.npmjs.com/package/@nashihang777/dsh-wolfram-nb)
[![license: MIT](https://img.shields.io/badge/license-MIT-green)](https://github.com/nashihang777/dsh-wolfram-nb/blob/main/LICENSE)

[简体中文](README.md) · **English** · [GitHub](https://github.com/nashihang777/dsh-wolfram-nb) · [npm](https://www.npmjs.com/package/@nashihang777/dsh-wolfram-nb)

![Wolfram Notebook for DeepSeek Harness](https://raw.githubusercontent.com/nashihang777/dsh-wolfram-nb/main/assets/social-preview.png)

> **A DeepSeek Harness plugin** that turns a locally installed Mathematica into an agent-callable
> tool, and renders the Wolfram notebook live beside the conversation.

Turns your locally installed Mathematica into a first-class tool of DeepSeek Harness: the agent calls
Wolfram Language the same way it calls any other tool, and the results render in a notebook panel on
the right side of the conversation.

> **Independence notice.** This plugin is not affiliated with, nor endorsed by, Wolfram Research.
> **Mathematica** and **Wolfram Language** are trademarks of Wolfram Research, Inc. The plugin ships
> no Wolfram software or resources; you must install and license Mathematica yourself.

## Install and distribution

**From npm (recommended):**

```
plugin_manager install_bundle  target=@nashihang777/dsh-wolfram-nb@1.2.0
```

The version may be omitted (defaults to `latest`), or pinned with `@1.2.0`.

**From GitHub:** clone the repository and install its root as a bundle:

```
git clone https://github.com/nashihang777/dsh-wolfram-nb.git
plugin_manager install_bundle  target=<absolute path to the clone>
```

**From a tarball:** `npm pack` produces `nashihang777-dsh-wolfram-nb-<version>.tgz`; extract it and
install the extracted directory as a bundle. The tarball contains plugin code only (~28 KB) and no
Wolfram components.

The target machine needs Windows and a REPL-capable `math.exe` (Mathematica, or a Wolfram Engine
installation that ships one).

The maintainer release flow (tag → GitHub Actions → npm) is documented in [RELEASING.md](RELEASING.md).

## Capabilities

| Capability | Detail |
|---|---|
| `wolfram_eval` | Evaluates arbitrary Wolfram Language in a persistent local kernel (one or many cells): symbolic algebra, calculus, equation solving, matrices, units, data handling, file import/export, and more |
| `wolfram_notebook` | `open` renders an existing `.nb`; `reset` restarts the kernel; `status` reports kernel state |
| In-panel notebook picker | The panel's “Open…” button lists the `.nb` files found in the workspace (root, `wolfram-notebooks/`, the current notebook's directory); click to render, or type a path |
| `/wolfram-open` command | Run `/wolfram-open <path>` in the composer to switch the panel without producing a model message |
| Right-side notebook panel | Renders titles, body text, input cells, MathML formulas, PNG graphics and messages beside the conversation |
| Persistent kernel | One long-lived `math.exe` per session; variables and definitions survive across calls |
| `.nb` export | Every evaluation writes a real Mathematica notebook file into `wolfram-notebooks/` |

## Architecture

```
Host plugin (index.js)
  ├─ one `math.exe -noprompt` process per session
  ├─ bridge.wl: file-based JSON protocol (one file per request/response; stdout carries markers only)
  ├─ writes the result to .dsh-wolfram/latest.json (publishedAt, MathML, base64 PNG)
  └─ registers the wolfram_eval / wolfram_notebook tools
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

The panel opens automatically with the formulas and graphics, and a
`wolfram-notebooks/<title>-<time>.nb` file is written for further editing in Mathematica.

Render an existing notebook:

```
wolfram_notebook  action="open"  path="wolfram-notebooks/xxx.nb"
```

You can also switch notebooks inside the panel: click “Open…” at the top, then pick a `.nb` from the
list (or type a path) — the panel renders it immediately and makes it the current document.
`/wolfram-open <path>` is the command form of the same action and produces no model message.

To open the panel manually: right sidebar “+” → Wolfram notebook (the panel registers a guide entry).

## Configuration

Override the row's `config` in the profile's `cordis.patch.yml`:

```yaml
- id: wolfram-notebook
  name: '@nashihang777/dsh-wolfram-nb'
  config:
    kernel: 'C:\Program Files\Wolfram Research\Wolfram\15.0\math.exe'
    timeoutMs: 180000
    idleMs: 1800000
```

| Field | Default | Meaning |
|---|---|---|
| `kernel` | auto-detect | Path to `math.exe`, the kernel's directory, or a product directory holding version subdirectories |
| `timeoutMs` | 180000 | Per-request timeout; on expiry the kernel is killed |
| `idleMs` | 1800000 | How long an idle kernel is kept before being reclaimed |

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
- `.dsh-wolfram/tmp/` — kernel request/response scratch files
- `wolfram-notebooks/*.nb` — exported Mathematica notebooks

## Known limitations

- Interactive front-end constructs (`Manipulate`, `Dynamic`, the notebook UI itself) cannot be interactive on the web page; they render as static formulas or plain text.
- A few expressions (for example `Quantity`) have no MathML export; the panel falls back to `InputForm` text while the kernel still returns valid TeX.
- Graphics need the front end to rasterize; the first plot takes 1–3 seconds.
- Sessions sharing one workspace share `latest.json` (kernels stay per-session).
- After a page load, the first auto-reveal of the right sidebar needs one user gesture (or click “+” → Wolfram notebook); every later evaluation reveals and focuses the panel automatically.
- **Notebooks exported by early versions cannot be recovered**: the first implementation used `MakeBoxes` inside a `Module`, so output cells were written as `value$…` placeholders (`$` is part of the variable name, so the original value cannot be reconstructed). Recompute to generate a new notebook; the current version uses `ToBoxes` and is correct.

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

## License and trademarks

- Licensed under [MIT](https://github.com/nashihang777/dsh-wolfram-nb/blob/main/LICENSE). Version and fix history: [CHANGELOG.md](https://github.com/nashihang777/dsh-wolfram-nb/blob/main/CHANGELOG.md).
- Not affiliated with or endorsed by Wolfram Research; **Mathematica** and **Wolfram Language** are its registered trademarks, used here descriptively only.
- The plugin ships no Wolfram software, paclets, documentation or brand assets; at runtime it drives the user's own licensed Mathematica. Deploying it as a multi-tenant compute service may conflict with Wolfram's license terms — that call belongs to the deployer.
