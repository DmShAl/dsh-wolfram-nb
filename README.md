# Wolfram 笔记本插件（`@nashihang777/dsh-wolfram-nb`）

[![topic: dsh-plugin](https://img.shields.io/badge/topic-dsh--plugin-0b7285)](https://github.com/topics/dsh-plugin)
[![npm](https://img.shields.io/npm/v/@nashihang777/dsh-wolfram-nb?label=npm)](https://www.npmjs.com/package/@nashihang777/dsh-wolfram-nb)
[![license: MIT](https://img.shields.io/badge/license-MIT-green)](https://github.com/nashihang777/dsh-wolfram-nb/blob/main/LICENSE)

**简体中文** · [English](README.en.md) · [GitHub](https://github.com/nashihang777/dsh-wolfram-nb) · [npm](https://www.npmjs.com/package/@nashihang777/dsh-wolfram-nb)

![Wolfram Notebook for DeepSeek Harness](https://raw.githubusercontent.com/nashihang777/dsh-wolfram-nb/main/assets/social-preview.png)

> **DeepSeek Harness 插件**：把本地安装的 Mathematica 变成智能体可调用的工具，并把 Wolfram 笔记本实时渲染在对话窗口右侧。
> Mathematica kernel bridge and live notebook panel for DeepSeek Harness.

把本地安装的 Mathematica 变成 DeepSeek Harness 的"自己的工具"：智能体可以像调用其它工具一样调用 Wolfram Language，结果会实时渲染在对话窗口右侧的笔记本面板中。

> **独立项目声明**：本插件与 Wolfram Research 无隶属关系，也未获其背书。
> **Mathematica** 与 **Wolfram Language** 是 Wolfram Research, Inc. 的商标。
> 插件不包含、不重新分发任何 Wolfram 软件或资源；使用时需要用户自行安装并授权 Mathematica。

## 安装与分发

**从 npm 安装（推荐）**：

```
plugin_manager install_bundle  target=@nashihang777/dsh-wolfram-nb@1.2.0
```

版本号可省略（默认 `latest`），或用 `@1.2.0` 固定版本。

**从 GitHub 安装**：克隆仓库后，把仓库根目录作为 bundle 安装：

```
git clone https://github.com/nashihang777/dsh-wolfram-nb.git
plugin_manager install_bundle  target=<克隆目录的绝对路径>
```

**从 tgz 安装**：`npm pack` 生成 `nashihang777-dsh-wolfram-nb-<version>.tgz`，解压后把目录作为 bundle 安装。
分发包只含插件代码（约 25 KB），不包含任何 Wolfram 组件。

目标机器需要 Windows + 可交互的 `math.exe`（Mathematica 或含 `math.exe` 的 Wolfram Engine）。

维护者发布流程（标签触发 GitHub Actions 自动发 npm）见
[RELEASING.md](https://github.com/nashihang777/dsh-wolfram-nb/blob/main/RELEASING.md)。

## 能力

| 能力 | 说明 |
|---|---|
| `wolfram_eval` | 在常驻的本地内核里执行任意 Wolfram Language 代码（一个或多个单元），支持符号计算、微积分、方程求解、矩阵、单位、数据处理、文件导入导出等 |
| `wolfram_notebook` | `open` 渲染已有的 `.nb` 文件；`reset` 重启内核；`status` 查看内核状态 |
| `wolfram_job` | `submit` 在独立内核里后台运行长时间计算（默认 30 分钟）；`status`/`result`/`cancel`/`list` 管理任务，`status` 显示运行中任务最近的 `Print` 输出 |
| `wolfram_verify` | `identity` — численная проверка тождества (lhs/rhs, переменные, допуск); `ode` — невязка решения ОДУ на отрезке; `integral` — сверка определённого интеграла с замкнутой формой |
| `wolfram_state` | `status` — число Global-символов, память, `$Assumptions`, пакеты; `symbols` — список определений; `save`/`load` — `DumpSave`/`Get` состояния в `.dsh-wolfram/state-*.mx` |
| `wolfram_render` | экспорт `Plot`/`Graphics` в PNG/SVG/PDF/JPG с `ImageResolution`; создаёт каталог и возвращает размер файла |
| `wolfram_batch` | параллельный запуск независимых фрагментов кода, каждый в своём ядре (`maxParallel`, до 12 элементов); в ответе — отчёт OK/FAILED по каждому |
| 面板内选择笔记本 | 面板顶部「打开…」列出工作区（根目录、`wolfram-notebooks/`、当前笔记本目录）里的 `.nb`，点选即渲染；也可直接输入路径 |
| `/wolfram-open` 命令 | 在输入框执行 `/wolfram-open <路径>`，不产生模型消息，直接切换面板内容 |
| 右侧笔记本面板 | 在对话旁实时渲染标题、正文、输入单元、MathML 公式、图形（PNG）、消息 |
| 持久内核 | 每个会话一个常驻 `math.exe`，变量与函数定义跨调用保留 |
| `.nb` 导出 | 每次计算自动生成真正的 Mathematica 笔记本文件（`wolfram-notebooks/`） |

## 架构

```
Host 插件 (index.js)
  ├─ 每个会话一个 math.exe -noprompt 进程
  ├─ bridge.wl：文件式 JSON 协议（请求/响应各一个文件，stdout 只走标记行）
  ├─ 把结果写成 .dsh-wolfram/latest.json（含 publishedAt、MathML、base64 PNG）
  ├─ wolfram_job：每个任务一个独立 math.exe（超时不打断会话内核）
  └─ 注册 wolfram_eval / wolfram_notebook / wolfram_job 三个工具
Client 插件 (client.js)
  ├─ 注册右侧栏 Tab 类型 wolfram-notebook（同时注册引导页入口）
  ├─ 面板轮询 latest.json，按 publishedAt 增量刷新
  └─ 自动打开：检测到新的 publishedAt 时调用 ctx.sidebarRight.openTab
```

选择 CLI/内核桥接而不是 MCP 的原因：MCP 服务器需要额外的 paclet 与进程，工具集合固定；直接驱动内核对 Mathematica 版本、输出格式（MathML/PNG/TeX）、会话状态和渲染数据都有完全控制，而且没有额外依赖。内核仍然是一个完整、可交互的 Wolfram 会话，能力上等价于 `math.exe` 命令行。

## 使用

智能体侧直接调用工具即可：

```
wolfram_eval  title="巴塞尔问题"
cells=[
  {"type":"title","text":"巴塞尔问题"},
  {"type":"input","code":"Sum[1/n^2, {n, 1, Infinity}]"},
  {"type":"input","code":"Plot[Sin[x]/x, {x, -10, 10}]"}
]
```

面板会自动打开并显示公式与图形；同时生成
`wolfram-notebooks/<标题>-<时间>.nb`，可以直接用 Mathematica 打开继续编辑。

渲染已有笔记本：

```
wolfram_notebook  action="open"  path="wolfram-notebooks/xxx.nb"
```

面板里也可以直接切换：点顶部「打开…」→ 从列表选一个 `.nb`（或输入路径）→ 面板立即渲染，
同时把该文件设为面板的当前文档。`/wolfram-open <路径>` 是同一能力的命令形式，
可以直接在输入框执行，不会产生模型消息。

Проверка результата, сохранение состояния и рендер в файл:

```
wolfram_verify  action="identity"  lhs="Sin[x]^2 + Cos[x]^2"  rhs="1"  variables=["x"]
wolfram_verify  action="ode"  ode="y'[x] == y[x]"  solution="Exp[x]"  range=[0, 1]
wolfram_verify  action="integral"  integral="Integrate[Exp[-x^2], {x, 0, 1}]"  result="Sqrt[Pi]/2 Erf[1]"
wolfram_state   action="save"  path=".dsh-wolfram/derivation.mx"
wolfram_state   action="load"  path=".dsh-wolfram/derivation.mx"
wolfram_render  expr="Plot[Sin[x], {x, 0, 2 Pi}]"  format="svg"
```

Если `Integrate`/`Solve`/`DSolve` вернули выражение без изменений, в summary появится
подсказка (`Reduce`, `NIntegrate`, `NDSolve`, ...). Для независимых прогонов используйте
`wolfram_batch` (каждый элемент — отдельное ядро).

手动打开面板：右侧栏的"+"→ Wolfram 笔记本（面板注册了引导页入口）。

## 配置

在 profile 的 `cordis.patch.yml` 中覆盖本行的 `config`：

```yaml
- id: wolfram-notebook
  name: '@nashihang777/dsh-wolfram-nb'
  config:
    kernel: 'C:\Program Files\Wolfram Research\Wolfram\15.0\math.exe'
    timeoutMs: 180000
    idleMs: 1800000
    # kernelArgs: ['-pacletreadonly']   # 可选
    # maxRunningJobs: 4                 # 可选
```

| 字段 | 默认 | 说明 |
|---|---|---|
| `kernel` | 自动探测 | `math.exe` 路径、内核所在目录，或包含版本子目录的产品目录 |
| `timeoutMs` | 180000 | 单次请求超时，超时会杀掉内核 |
| `idleMs` | 1800000 | 空闲内核回收时间 |
| `kernelArgs` | `[]` | 传给 `math.exe` 的附加参数，例如 `['-pacletreadonly']`：关闭 paclet 自动更新，避免联网卡死 |
| `maxRunningJobs` | `4` | 同时运行的作业数上限；超出的任务进入 FIFO 队列 |

`wolfram_eval` 还接受单次调用的 `timeoutMs`（毫秒），覆盖上面的默认值；超时时错误信息会
附上内核最后几行输出，便于判断是否卡在下载上。

### 内核探测顺序（适配不同安装位置）

`kernel-discovery.js` 按以下顺序查找可用的 REPL 内核，命中即止：

1. 插件配置 `config.kernel`（可为 exe、内核目录或产品目录；指定后必须有效，否则报错并提示）
2. 环境变量 `WOLFRAM_KERNEL` / `MATHEMATICA_KERNEL`
3. Wolfram 安装器写入的注册表记录：
   `HKLM/HKCU\SOFTWARE\Wolfram Research\Installations\*`，
   读取 `ExecutablePath` / `InstallationDirectory` / `ProductVersion`，
   按版本从高到低取同目录下的 `math.exe`
4. 标准安装布局：`%ProgramFiles%`、`%ProgramW6432%`、`%ProgramFiles(x86)%`
   下的 `Wolfram Research\{Wolfram, Mathematica, Wolfram Engine, Wolfram Player}\<版本>`
5. `PATH` 中的 `math.exe`（Wolfram Engine 常见）

因此客户把 Mathematica 装在 `D:\Apps\Wolfram\15.1`、同时装了多个版本、或装的是
Wolfram Engine，都能自动找到；只有"没有注册表记录且不在标准目录"的绿色/手工拷贝安装
才需要显式配置：

```yaml
config:
  kernel: 'D:\Apps\Wolfram\15.1'
```

> 内核宿主要求是可交互的 `math.exe` / `MathKernel.exe`（从 stdin 读表达式）。
> `WolframNB.exe`、`wolfram.exe`、`WolframKernel.exe` 只用于定位安装目录，不会被直接启动
> （实测 `WolframKernel.exe -noprompt` 不响应 stdin REPL）。
> 注册表探测仅适用于 Windows；macOS/Linux 请用 `config.kernel` 或 `WOLFRAM_KERNEL` 指向 `math`。

`wolfram_notebook action="status"` 会返回实际使用的内核路径和发现方式，便于排障。

## 数据位置

- `.dsh-wolfram/latest.json`：面板渲染的文档（会话内、工作区内）
- `.dsh-wolfram/tmp/`：内核请求/响应的临时文件
- `wolfram-notebooks/*.nb`：导出的 Mathematica 笔记本

## 已知限制

- 交互式前端对象（`Manipulate`、`Dynamic`、笔记本界面本身）无法在网页里交互；表达式会以静态公式或普通文本显示。
- 少数表达式（如 `Quantity`）没有 MathML 导出，面板回退为 `InputForm` 文本；内核仍返回正确的 TeX。
- 图形需要前端进程做光栅化；首次绘图会慢 1–3 秒。
- 同一工作区的多个会话共享 `latest.json`（内核仍按会话隔离）。
- 页面刷新后，第一次自动展开右侧栏需要一次用户手势（或点右侧栏的"+"选择 Wolfram 笔记本）；
  之后每次新的计算都会自动展开并聚焦面板。
- **旧版本导出的 `.nb` 不可恢复**：早期实现用 `MakeBoxes` 在 `Module` 内装箱，输出单元被写成了
  `value$…` 占位符（`$` 是变量名的一部分，无法反推原值）。请重新计算生成新的笔记本；
  当前版本已改用 `ToBoxes`，新文件正常。

## 修复记录

- **输出单元写成 `value$…`**：`MakeBoxes` 的 `HoldAllComplete` 让 `Module` 局部符号被原样装箱。
  导出改用 `ToBoxes[value, StandardForm]`（先求值再装箱）。
- **重新打开 `.nb` 时图形不渲染**：`GraphicsBox` 里存的是盒式基元，直接转 MathML/文本会得到乱码。
  导入改为 `MakeExpression` 还原 `Graphics`/`Graphics3D`/`Legended` 表达式后用前端重新光栅化为 PNG；
  文本/公式单元仍走 MathML。

## 开发说明

`bridge.wl` 的协议：

```
stdin:  WolframBridge`EvalFile["<请求 JSON 文件路径>"];
stdout: @@WB_READY@@<version>
        @@WB_BEGIN@@<id>
        <计算过程中 Print/消息产生的行>
        @@WB_DOC@@<id>@@<响应文件路径或 base64>
```

请求 JSON 使用纯 ASCII（非 ASCII 字符以 `\uXXXX` 转义写入），响应为 base64 编码的 JSON，
避免 Windows 控制台编码差异。修改 `bridge.wl` 后执行一次 `wolfram_notebook(..., action="reset")`
或重启内核即可生效；修改 `client.js` 后需要重新加载插件（本仓库通过 `plugin_manager` 切换启用状态完成）。

## 许可证与商标

- 本插件采用 [MIT](https://github.com/nashihang777/dsh-wolfram-nb/blob/main/LICENSE) 许可证。
  版本与修复记录见 [CHANGELOG.md](https://github.com/nashihang777/dsh-wolfram-nb/blob/main/CHANGELOG.md)。
- 与 Wolfram Research 无隶属关系，未获其背书；**Mathematica**、**Wolfram Language** 是其注册商标，
  本文仅作描述性使用。
- 插件不包含、不重新分发任何 Wolfram 软件、paclet、文档或品牌资源；运行时调用用户本地已授权的
  Mathematica。把插件部署为对外多租户计算服务可能不符合 Wolfram 的许可条款，请部署者自行确认。
