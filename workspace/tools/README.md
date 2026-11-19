# Инструменты расчётного каталога

Запускаются из корня каталога: `tools\<имя> ...`. Скрипты `.cmd` рассчитаны на cp866-консоль
Windows (текст только ASCII), Python — всегда абсолютный
`C:\Tools\Scripts\Python314\python.exe`.

| Инструмент | Что делает |
|---|---|
| `node tools\new-task.mjs <имя> [--title "…"]` | Создаёт `tasks/<имя>/`: `TASK.md`, `report.md`, `code.wl`, `_plots/`, `_work/`. `--title` задаёт заголовок в `TASK.md` и `report.md` (по умолчанию — имя). Существующую задачу не трогает. |
| `tools\build-report.cmd <report.md\|report.tex>` | Собирает `report.docx` + `report.pdf` рядом с исходником через PDFConv и после успешной сборки делает снимок версии в `_versions\<YYYY_MM_DD-HH_MM_SS>\`. `--check` — только окружение, `--no-overwrite` — не заменять существующие результаты (код 3), `--no-snapshot` — без снимка, `--keep N` — сколько версий хранить. |
| `tools\pdfcheck.cmd <report.pdf>` | Проверяет PDF: страницы, текстовый слой и кириллицу, изображения; `--pages 1`, `--out _work` — рендер страниц в PNG. |
| `tools\check-report.cmd <report.pdf>` | Проверяет, что рядом есть `report.docx`, затем вызывает `pdfcheck.cmd` (по умолчанию `--pages 1`) и пробрасывает его код возврата. |
| `tools\extract-md.cmd <file.docx>` | Обратное направление: DOCX → Markdown + LaTeX. Без `--force` не перезаписывает существующий `.md`. |
| `tools\snapshot.cmd <task-dir> [--keep N] [--force]` | Ручной снимок текущей версии задачи в `_versions\<timestamp>\` (то же, что делает `build-report`): `TASK.md`, `report.md/.tex`, `*.wl`, `report.pdf/.docx`, `_plots/`. Идентичный снимок пропускается, `--force` создаёт принудительно, `--keep N` оставляет N последних (по умолчанию 20). |
| `tools\python.cmd ...` | Запускает Python 3.14 по абсолютному пути: `tools\python.cmd -c "import sympy; print(sympy.__version__)"` или `tools\python.cmd script.py`. |

`build-report`, `pdfcheck`, `check-report` и `python` используют один и тот же интерпретатор
(Python 3.14; `DSH_PYTHON` переопределяет путь, если он абсолютный). Лаунчеры `py`/`pyw` и
`python` из PATH не используются: на этой машине лаунчер `py` запускает 3.15 без научного стека.
