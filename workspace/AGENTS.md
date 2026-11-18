# AGENTS.md — расчётный каталог

Этот каталог — рабочее место для расчётов в Mathematica через DSH. Он скопирован из
`dsh-wolfram-nb\workspace`; плагин (`dsh-wolfram-nb`) и сборка отчётов (`dsh-pdfconv`)
живут отдельно, здесь только задачи, данные и отчёты.

Файл самодостаточен: все правила Mathematica, рисунков и отчётов собраны здесь, поэтому
глобальный `~\.dsh\AGENTS.md` не нужен. Если в каталоге задачи лежит свой `AGENTS.md` или
`CLAUDE.md`, он имеет приоритет над этими правилами.

## Начало сессии

- Работаем в текущем каталоге или в том, который назвал пользователь. Обязательного `tasks\`
  нет: задача может жить в любом каталоге. `tasks\` — просто удобный хаб, если задач несколько.
- Если задача названа — прочитай `TASK.md` в её каталоге (если он есть) и продолжай.
- Прочитай `NOTES.md` — короткий журнал: что сделано в прошлые сессии.
- **Подтверди готовность.** Если в каталоге есть `AGENTS.md` и `tools\`, вызови
  `wolfram_ready` и в первом же ответе коротко напиши, что окружение готово: сколько
  компонентов найдено, есть ли git-репозиторий, и что можно ставить задачу. Если чего-то
  нет — перечисли, чего именно, и предложи `/initmath`. То же самое сделай на следующем
  ходу после того, как каталог только что подготовили кнопкой InitMath.
- Одна задача — один каталог; не смешивай несколько задач в одном каталоге.

## Структура

| Каталог | Назначение |
|---|---|
| `tasks\` | (опционально) хаб задач: `tasks\<задача>\` — `TASK.md`, `code.wl`, `report.md`, `_data\`, `_work\`, `_plots\` |
| `tools\` | скрипты: `new-task.mjs`, `build-report.cmd`, `pdfcheck.cmd`, `extract-md.cmd`, шаблоны |
| `data\` | общие входные данные |
| `wolfram-plots\` | сессионные графики (в git не коммитятся) |
| `wolfram-notebooks\` | `.nb`, только при `exportNotebook: true` |
| `.dsh-wolfram\` | служебное: `latest.json`, `tmp/` (временные файлы и `last-console.log`), `jobs/<id>.log`, `batch/`, сохранения состояния |

## Инструменты

| Инструмент | Назначение |
|---|---|
| `wolfram_eval` | постоянное ядро: вычисления, серии ячеек; длинный console сокращается, полный текст — `.dsh-wolfram/tmp/last-console.log` или `fullConsole: true` |
| `wolfram_alpha` | Wolfram\|Alpha, пошаговые решения |
| `wolfram_job` | долгие вычисления в фоне (submit/status/result/cancel/log/list; 30 мин по умолчанию); `result` с `wait` ждёт завершения, `full: true` — весь console; полный лог задачи всегда в `.dsh-wolfram/jobs/<id>.log`, читается `action="log"` |
| `wolfram_batch` | независимые прогоны в отдельных ядрах (`maxParallel`); лог каждого элемента — в `.dsh-wolfram/batch/` |
| `wolfram_verify` | проверка результата: identity/ode/integral/antiderivative, статусы |
| `wolfram_render` | рисунок в файл: PNG/SVG/PDF/JPG, MaTeX подгружается сам |
| `wolfram_state` | состояние ядра: status/symbols/save/load/clear |
| `wolfram_notebook` | `.nb` в панели: open/reset/status |
| `pdfconv_convert` | `.md`/`.tex` → `pdf`+`docx`, `.docx` → `md`; существующие файлы не перезаписывает без `overwrite: true` |
| `pdfconv_check` | окружение PDFConv: Pandoc, MiKTeX, пакеты LaTeX, шрифты, пробная сборка |
| `wolfram_ready` | готов ли каталог: `AGENTS.md`/`tools`, компоненты, git |
| `wolfram_check` | статическая проверка кода до запуска (CodeInspector): синтаксис и подозрительные места, код не вычисляется; в режиме скрипта скрывает шум `SuspiciousSessionSymbol`/`NonASCIICharacter`, `strict: true` — всё |
| `wolfram_help` | символы: текст справки, `ArgumentsPattern`, опции с умолчаниями — вместо угадывания имён |
| `wolfram_doc` | раздел «Details» локальной страницы справки — офлайн, без сети |

## Окружение

- Ядро: `C:\Program Files\Wolfram Research\Wolfram\15.0\math.exe`.
- MaTeX 1.7.10 настроен на MiKTeX (`C:\Program Files\MiKTeX`); `wolfram_render`
  подгружает его сам при наличии `MaTeX[...]`. Первый рендер ~60 с.
- Физические пакеты в `%APPDATA%\Wolfram\Applications`: FeynCalc (+FeynArts), xAct,
  Package-X, SciDraw; дистрибутив — `D:\Distr\LLM\HarnessLLM\WolframPackages`.
- PDFConv: `D:\Projects\PDFConv` (`src\convert.py`), окружение проверяет `pdfconv_check`.
- Python 3.14: `C:\Tools\Scripts\Python314\python.exe` (numpy, pandas, scipy, statsmodels,
  matplotlib, pymupdf) — через `ExternalEvaluate` или напрямую.
- R 4.5.3: `C:\Tools\R\R-4.5.3` (в `PATH`), RLink через `Needs["RLink`"]`; `InstallR[]`.

## Правила работы

- `Needs[...]` — в отдельной ячейке от кода, иначе символы уходят в `Global``.
- **Кодировка штатно UTF-8.** Все ядра (сессия, задача, batch, verify) стартуют с
  `$CharacterEncoding = "UTF-8"`, поэтому `Get["code.wl"]` читает UTF-8 без BOM, кириллица в
  `Print` приходит без искажений, а подписи на рисунках из `wolfram_job` остаются читаемыми.
  `Block[{$CharacterEncoding = "UTF-8"}, ...]` и пересохранение файлов с BOM больше не нужны.
  Если задача требует другую кодировку, её задают переменной окружения
  `DSH_WOLFRAM_CHARACTER_ENCODING` до старта DSH.
- Долгие расчёты — `wolfram_job` (30 мин) или `wolfram_batch` для независимых прогонов.
  Полный console задачи доступен в `wolfram_job action="log"` и в `.dsh-wolfram/jobs/<id>.log`.
- Результат после `Integrate`/`Solve`/`DSolve` проверять через `wolfram_verify`; численную
  проверку не выдавать за доказательство.
- Промежуточные определения сохранять `wolfram_state save` перед паузами.
- Рисунки сохранять файлами (`wolfram_render`): финальные — в `_plots\` задачи, черновые —
  в `_work\`; смотреть через `read_image`, а не выводить голый `Graphics` в панель.
- `Needs`/MaTeX — отдельной ячейкой; SciDraw в headless не применяет диапазоны —
  для публикационных рисунков `Plot` + MaTeX.
- FeynCalc + FeynArts: `$FAPatch = False; $LoadFeynArts = True; Needs["FeynCalc`"]`.

## Задача = отдельный каталог

Одна задача — один каталог, где бы он ни был. В корне задачи: `TASK.md`, `code.wl`
(исходник на Wolfram Language, по которому воспроизводятся числа и рисунки) и результаты
(`report.md`, `report.docx`, `report.pdf`); служебное — `_data\` (входные данные, только
читать), `_work\` (временные файлы, можно удалять), `_plots\` (финальные рисунки).

Каркас создаётся одной командой: `node tools\new-task.mjs <имя>`.

## Отчёты: Markdown + LaTeX → DOCX + PDF

1. Текст — `report.md` в каталоге задачи. Формулы: `$...$` в строке, `$$...$$` выключные.
   Рисунки — пути относительно md: `_plots/файл.png`. Основа — `tools\report-template.md`.
2. Сборка: `pdfconv_convert { "files": ["<каталог>/report.md"] }` (плагин `dsh-pdfconv`)
   или `tools\build-report.cmd <путь>` (`--check` — окружение, `--no-overwrite` —
   не трогать существующие docx/pdf, код 3). Прямой вызов:
   `py -3 D:\Projects\PDFConv\src\convert.py --formats docx,pdf <путь>`.
   Рядом появятся `report.docx` (формулы — редактируемые объекты Word) и `report.pdf`.
   Существующие результаты по умолчанию не перезаписываются — нужен `overwrite: true`.
3. Проверка: `tools\pdfcheck.cmd report.pdf --pages 1,3 --out _work` — страницы, объём
   текста, число кириллических символов, первые строки и рендер страниц в PNG
   (`pdfcheck.cmd` сам переключает консоль в UTF-8, чтобы кириллица не превращалась в кракозябры).

Обратное направление — DOCX → Markdown с формулами: `pdfconv_convert` с `formats: ["md"]`
или `tools\extract-md.cmd [--force] <файл.docx>`. MathType-формулы перед извлечением
перевести в Word транслятором «LaTeX (Cyrillic)».

## Память между сессиями

- `NOTES.md` — журнал: одна строка на задачу/этап, детали не пишем.
- `TASK.md` в каталоге задачи — постановка, ход работы, решения, что осталось.
- В конце сессии/этапа: итог — в `TASK.md`; строка — в `NOTES.md`.

## Git

- `/initmath` заводит в каталоге локальный репозиторий с первым коммитом и, если установлен
  `git-lfs`, сразу включает LFS для `*.pdf`, `*.docx`, `*.png`, `*.jpg`, `*.xlsx`, `*.svg`,
  `*.zip`. Зафиксировать текущее состояние — `/mathsave "что сделано"` (или обычный `git commit`),
  посмотреть — `git log --oneline`.
- Коммитить `TASK.md`, `code.wl`, `report.md`, `report.docx/pdf`, `_plots\`, `tools\`, `NOTES.md`.
- Бинарные результаты (`*.pdf`, `*.docx`, `*.png`, `*.jpg`, `*.xlsx`) — в Git LFS
  (`.gitattributes`); при push в GitHub квота LFS ~1 ГБ хранения и трафика в месяц.
- Не коммитить: `_work\`, `wolfram-notebooks\`, `wolfram-plots\`, `.dsh-wolfram\` —
  они в `.gitignore`.

## Проверка окружения

```wl
Needs["MaTeX`"];
MaTeX["x^2"]                     (* Graphics *)
Plot[Sin[x], {x, 0, 2 Pi}]       (* график *)
```

Быстрый тест плагина: `wolfram_eval` с `1+1` → `2`, затем `wolfram_notebook action="status"`.
