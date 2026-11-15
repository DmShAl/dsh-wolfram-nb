# AGENTS.md — расчётный каталог

Этот каталог — рабочее место для расчётов в Mathematica через DSH. Он скопирован из
`dsh-wolfram-nb\workspace`; плагин (`dsh-wolfram-nb`) и сборка отчётов (`dsh-pdfconv`)
живут отдельно, здесь только задачи, данные и отчёты.

## Начало сессии

- Работаем в текущем каталоге или в том, который назвал пользователь.
- Обязательного `tasks\` нет: задача может жить в любом каталоге. `tasks\` — просто
  удобный хаб, если задач несколько.
- Если задача названа — прочитай `TASK.md` в её каталоге (если он есть) и продолжай.
- Прочитай `NOTES.md` — короткий журнал: что сделано в прошлые сессии.

## Структура

| Каталог | Назначение |
|---|---|
| `tasks\` | (опционально) хаб задач: `tasks\<задача>\` — `TASK.md`, `code.wl`, `report.md`, `_data\`, `_work\`, `_plots\` |
| `tools\` | скрипты: `new-task.mjs`, `build-report.cmd`, `pdfcheck.cmd`, `extract-md.cmd`, шаблоны |
| `data\` | общие входные данные |
| `wolfram-plots\` | сессионные графики (в git не коммитятся) |
| `wolfram-notebooks\` | `.nb`, только при `exportNotebook: true` |
| `.dsh-wolfram\` | служебное: `latest.json`, временные файлы, сохранения состояния |

## Окружение

- Ядро: `C:\Program Files\Wolfram Research\Wolfram\15.0\math.exe`.
- Инструменты: `wolfram_eval`, `wolfram_alpha`, `wolfram_job`, `wolfram_verify`,
  `wolfram_state`, `wolfram_render`, `wolfram_batch`, `wolfram_notebook`;
  для PDFConv — `pdfconv_convert`, `pdfconv_check`.
- MaTeX 1.7.10 настроен на MiKTeX (`C:\Program Files\MiKTeX`); `wolfram_render`
  подгружает его сам при наличии `MaTeX[...]`. Первый рендер ~60 с.
- Физические пакеты в `%APPDATA%\Wolfram\Applications`: FeynCalc (+FeynArts), xAct,
  Package-X, SciDraw; дистрибутив — `D:\Distr\LLM\HarnessLLM\WolframPackages`.
- Python 3.14: `C:\Tools\Scripts\Python314\python.exe` (numpy, pandas, scipy, statsmodels,
  matplotlib, pymupdf) — через `ExternalEvaluate` или напрямую.
- R 4.5.3: `C:\Tools\R\R-4.5.3` (в `PATH`), RLink через `Needs["RLink`"]; `InstallR[]`.

## Правила работы

- `Needs[...]` — в отдельной ячейке от кода, иначе символы уходят в `Global``.
- Долгие расчёты — `wolfram_job` (30 мин) или `wolfram_batch` для независимых прогонов.
- Результат после `Integrate`/`Solve`/`DSolve` проверять через `wolfram_verify`.
- Промежуточные определения сохранять `wolfram_state save` перед паузами.
- Рисунки сохранять файлами (`wolfram_render`): финальные — в `_plots\` задачи, черновые —
  в `_work\`; смотреть через `read_image`, а не выводить голый `Graphics` в панель.
- `Needs`/MaTeX — отдельной ячейкой; SciDraw в headless не применяет диапазоны —
  для публикационных рисунков `Plot` + MaTeX.

## Задача = отдельный каталог

Одна задача — один каталог, где бы он ни был. В корне задачи: `TASK.md`, `code.wl`
(исходник на Wolfram Language, по которому воспроизводятся числа и рисунки) и результаты
(`report.md`, `report.docx`, `report.pdf`); служебное — `_data\` (входные данные),
`_work\` (временные файлы, можно удалять), `_plots\` (финальные рисунки).

Каркас создаётся одной командой: `node tools\new-task.mjs <имя>`.

## Отчёты: Markdown + LaTeX → DOCX + PDF

1. Текст — `report.md` в каталоге задачи. Формулы: `$...$` в строке, `$$...$$` выключные.
   Рисунки — пути относительно md: `_plots/файл.png`. Основа — `tools\report-template.md`.
2. Сборка: `pdfconv_convert { "files": ["<каталог>/report.md"] }` (плагин `dsh-pdfconv`)
   или `tools\build-report.cmd <путь>` (`--check` — окружение, `--no-overwrite` —
   не трогать существующие docx/pdf, код 3). Прямой вызов:
   `py -3 D:\Projects\PDFConv\src\convert.py --formats docx,pdf <путь>`.
   Рядом появятся `report.docx` (формулы — редактируемые объекты Word) и `report.pdf`.
3. Проверка: `tools\pdfcheck.cmd report.pdf --pages 1,3 --out _work` — страницы, объём
   текста, число кириллических символов, первые строки и рендер страниц в PNG
   (консоль переключается в UTF-8, иначе кириллица — кракозябры).

Обратное направление — DOCX → Markdown с формулами: `pdfconv_convert` с `formats: ["md"]`
или `tools\extract-md.cmd [--force] <файл.docx>`. MathType-формулы перед извлечением
перевести в Word транслятором «LaTeX (Cyrillic)».

## Память между сессиями

- `NOTES.md` — журнал: одна строка на задачу/этап, детали не пишем.
- `TASK.md` в каталоге задачи — постановка, ход работы, решения, что осталось.
- В конце сессии/этапа: итог — в `TASK.md`; строка — в `NOTES.md`.

## Git

- `/initmath` заводит в каталоге локальный репозиторий с первым коммитом, поэтому историю
  можно не терять: зафиксировать текущее состояние — `/mathsave "что сделано"` (или обычный
  `git commit`), посмотреть — `git log --oneline`.
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
