# AGENTS.md — окружение этой машины

Инструкция для будущих сессий в этом рабочем каталоге (`D:\Projects\Hardness\dsh-wolfram-nb`).
Проверено 12.11.2026 на Windows, DSH 0.2.2-rc.2, Mathematica 15.0.

## DSH

- Профиль: `desktop`, `DSH_HOME=C:\Users\shepe\.dsh`.
- CLI: `C:\Tools\DSH\resources\runtime\cli\bin\dsh.cmd`.
- Плагин `@nashihang777/dsh-wolfram-nb` **1.5.0** установлен в профиль
  (зависимость + запись в `dsh.profile.bundles`).
- Сборка/установка из репозитория: `build-tgz.bat` → tgz, `build-tgz.bat install` →
  `dsh plugin --profile desktop add file:<tgz>`. Подробности в `INSTALL.md`.
- Тесты: `npm test` (node --test, живое ядро, 24 теста, ~70 с); `npm.cmd` доступен
  (`C:\Program Files\nodejs`), Node v24.21.0.

## Mathematica

- Ядро: `C:\Program Files\Wolfram Research\Wolfram\15.0\math.exe`.
- Документация: per-user, `%LOCALAPPDATA%\Programs\Common\Wolfram Research\Documentation.en-us\15.0`.
- Пакеты ставятся копированием в `%APPDATA%\Wolfram\Applications` (`PacletInstall`
  из каталога/файла виснет — не использовать).
- **MaTeX 1.7.10** установлен, настроен на MiKTeX:
  `pdfLaTeX = C:/Program Files/MiKTeX/miktex/bin/x64/pdflatex.exe`,
  `Ghostscript = C:/Program Files/MiKTeX/miktex/bin/x64/mgs.exe`.
  Первый рендер MaTeX компилирует шаблон ~60 с, дальше кэш.
- LaTeX: MiKTeX в `C:\Program Files\MiKTeX` (xelatex/pdflatex/pdftocairo/pdfinfo есть);
  `pandoc` — `C:\Tools\pandoc\pandoc.exe`.

## Пакеты для физики (установлены)

`C:\Users\shepe\AppData\Roaming\Wolfram\Applications`:

| Пакет | Проверка |
|---|---|
| FeynCalc 10.2.1 (+ FeynArts 3.12 внутри `FeynCalc\FeynArts`) | `TR[GA[mu].GA[nu]]` → `4 Pair`; `CreateTopologies[0,2->2]` → 4 |
| FeynArts 3.12 (отдельно) | `Length[CreateTopologies[0, 2 -> 2]]` → 4 |
| xAct 1.3.0 | `DefManifold`/`DefMetric` → `MetricQ[g]` = True |
| Package-X 2.1.1 (paclet `X`, fork mule-tools) | `LoopRefine[LoopIntegrate[1,k,{k,M}]]` → `M^2 + M^2(Eps^-1 + Log[Mu^2/M^2])` |
| SciDraw 0.0.8 + MathObject, CustomTicks, InheritOptions, NamedColors, BlockOptions, Profile, StyleOptions | `Figure[FigGraphics[...]]` → `Graphics` |

- Загрузка FeynCalc вместе с FeynArts: `$FAPatch = False; $LoadFeynArts = True; Needs["FeynCalc`"]`
  (проверка `FAPatch` виснет >180 с).
- SciDraw в headless-режиме не применяет диапазоны при `Export`/`Rasterize` — для
  публикационных рисунков использовать `Plot` + MaTeX.
- Исходный дистрибутив пакетов: `D:\Distr\LLM\HarnessLLM\WolframPackages`
  (291 МБ: пакеты + `archives/` + `readme.txt`).

## Python и R

- Python 3.14: `C:\Tools\Scripts\Python314\python.exe`; установлены numpy, pandas,
  scipy 1.18.1, statsmodels 0.15.0, matplotlib 3.11.2, pyzmq 27.3.0.
  Мост: `ExternalEvaluate[{"Python", "C:/Tools/Scripts/Python314/python.exe"}, "..."]`.
- R **не установлен**; при необходимости — R 4.5.x + RLink (`InstallR[]`), rJava.
  R 4.6 с RLink не работает (нет бинарного rJava).

## Плагин: особенности

- `Needs[...]` — в отдельной ячейке; MaTeX в `wolfram_render` грузится отдельной
  ячейкой до парсинга выражения.
- `wolfram_state clear` чистит только Global-имена без `$`.
- `wolfram_verify identity` сначала пробует `Simplify[lhs-rhs, assumptions]`.
- `wolfram_job` публикует графику в панель; `wolfram_batch` — параллельные ядра.
- Пример отчёта: `report/lorenz-report.pdf` (LaTeX, формулы, 2D/3D-графики).
