# Рабочее место для расчётов (workspace)

Стартовый каталог для расчётных сессий DSH с плагинами `dsh-wolfram-nb` и `dsh-pdfconv`.
Скопируй его в новое место и начинай там — расчёт не обязан жить внутри репозитория
плагина:

```
robocopy D:\Projects\LLM\Hardness\dsh-wolfram-nb\workspace D:\Projects\MyTask /E
```

`AGENTS.md` в этом каталоге читается сессией автоматически, `tools\` — скрипты сборки
и проверки, `tasks\` — место для задач (необязательное: одна задача — один каталог
в любом месте).

## Что внутри

| Путь | Назначение |
|---|---|
| `AGENTS.md` | инструкции сессии: правила расчёта, отчётов, памяти |
| `NOTES.md` | журнал между сессиями (одна строка на задачу/этап) |
| `tools\new-task.mjs` | каркас задачи: `TASK.md`, `code.wl`, `_plots/`, `_work/` |
| `tools\build-report.cmd` | Markdown/LaTeX → DOCX + PDF (`--check`, `--no-overwrite`, `--no-snapshot`); после успешной сборки — снимок в `_versions/` |
| `tools\snapshot.cmd` | ручной снимок версии задачи в `_versions/<timestamp>/` |
| `tools\check-report.cmd` | PDF+DOCX на месте → `pdfcheck` (страницы рендерятся в `_work/`) |
| `tools\python.cmd` | Python 3.14 по абсолютному пути (numpy/scipy/sympy/mpmath) |
| `tools\pdfcheck.cmd` | проверка готового PDF: страницы, текстовый слой, кириллица, рендер |
| `tools\extract-md.cmd` | DOCX → Markdown с формулами LaTeX |
| `tools\task-template.md`, `report-template.md` | шаблоны |
| `tasks\` | задачи: `tasks/<имя>/` с `TASK.md`, `code.wl`, `report.md/docx/pdf` |
| `data\` | общие входные данные |
| `wolfram-plots\`, `wolfram-notebooks\` | сессионные артефакты (в git не попадают) |

Примеры готовых задач — в репозитории плагина: `..\examples\` (воронка, Лоренц, ОДУ).

## Быстрый старт

```powershell
node tools\new-task.mjs my-task --title "Демо-задача"   # каркас: TASK.md, report.md, code.wl
# ... расчёт через инструменты wolfram_* ...
# отчёт -> tools\build-report.cmd (после успеха — версия в _versions/, отключить: --no-snapshot)
# проверка -> tools\check-report.cmd report.pdf
```
