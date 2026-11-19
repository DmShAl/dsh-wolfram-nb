# Wolfram Language в DeepSeek Harness (`dsh-wolfram-nb`)

Плагин делает локальную Mathematica «своим» инструментом агента: он вызывает ваше
лицензированное ядро `math.exe`, а результат — формулы, графики, ошибки — показывает в живой
панели ноутбука справа от диалога.

- Русская версия — основная (этот файл). English: [README.en.md](README.en.md).
  中文: [README.zh.md](README.zh.md) — исходный текст проекта nashihang777, может отставать.
- Текущая версия: **1.16.10**, bridge `1.3.5`. История изменений — [CHANGELOG.md](CHANGELOG.md),
  установка из локальной сборки — [INSTALL.md](INSTALL.md), выпуск версий — [RELEASING.md](RELEASING.md).

**Требования:** Windows (обнаружение ядра через реестр — только Windows; на macOS/Linux путь
задаётся вручную), установленная Mathematica или Wolfram Engine, DSH, `node`/`npm.cmd` в `PATH`.
Для сборки отчётов — Python **3.14** по абсолютному пути `C:\Tools\Scripts\Python314\python.exe`
(в скриптах нет лаунчера `py` и PATH-фолбэков: на этой машине он запускает 3.15 без научного
стека). Плагин не поставляет и не перераспространяет Wolfram-компоненты.

## Установка

```bat
build-tgz.bat            :: собрать tgz
build-tgz.bat install    :: собрать и установить в профиль desktop
```

Скрипт собирает npm-пакет, снимает предыдущую версию из профиля (`dsh plugin remove`) и ставит
новую. Удаление перед установкой обязательно: pnpm иначе оставляет файлы прежней сборки, если
номер версии не изменился. После установки DSH нужно **полностью перезапустить**.

Проверка:

```
wolfram_notebook action="status"   →  "Plugin 1.16.10, bridge: 1.3.5 (Mathematica 15.x)"
node scripts/smoke.mjs             →  11/11 steps passed
```

Другие способы: склонировать репозиторий и поставить его как bundle через
`plugin_manager install_bundle target=<путь>`; в `.dsh`-профиле строка плагина выглядит так же,
как у любой другой сборки (`dsh.profile.bundles`). Пакет `nashihang777-dsh-wolfram-nb` в npm —
это исходный проект, а не эта сборка.

## Возможности

| Инструмент | Что делает |
|---|---|
| `wolfram_eval` | Выполняет код Wolfram Language в постоянном ядре (одна клетка или несколько): алгебра, анализ, уравнения, матрицы, единицы, данные, импорт/экспорт файлов. Длинный вывод консоли сокращается до 1500 символов, полный текст остаётся в `.dsh-wolfram/tmp/last-console.log`; `fullConsole: true` возвращает его целиком. Принимает `code`, `cells` или `path` к `.wl`-файлу: `path` выполняется как `Get[<файл>]` в постоянном ядре, без ручного экранирования |
| `wolfram_notebook` | `open` — показать существующий `.nb`; `reset` — перезапустить ядро; `status` — путь ядра, версия плагина и bridge, счётчики |
| `wolfram_job` | `submit` — долгий расчёт в отдельном ядре (30 мин по умолчанию); `status`/`result`/`cancel`/`log`/`list`; `status` показывает последние `Print`, `result` умеет `wait` (секунды, до 300) и `full: true` (весь console), `action="log"` читает полный лог. Каждая завершённая задача всегда пишет лог в `.dsh-wolfram/jobs/<id>.log`, путь виден в summary. `submit` принимает `code`, `cells` или `path` (`.wl`, через `Get`); `status` по умолчанию — короткая сводка (состояние, время, последние 4 строки прогресса, путь к логу; строки обрезаются до 160 символов), `verbose: true` — подробный список |
| `wolfram_verify` | Независимая проверка в одноразовом ядре (определения сессии не влияют): `identity` — `FullSimplify[lhs-rhs, assumptions]`, затем численная выборка; `ode` — невязка решения + краевые условия; `integral` — сверка с замкнутой формой; `antiderivative` — дифференцирование заявленной первообразной. Статусы: `verified_symbolic` / `numerically_consistent` / `falsified` / `inconclusive` |
| `wolfram_alpha` | Запрос к Wolfram\|Alpha; `steps` (по умолчанию `true`) — пошаговое решение, если сервис его предлагает; `maxChars` (по умолчанию 4000) ограничивает объём и сообщает, если ответ обрезан. Нужен интернет |
| `wolfram_state` | `status` — Global-символы, память, `$Assumptions`, пакеты; `symbols` — определённые имена; `save` — `DumpSave` в `.dsh-wolfram/state-<время>.mx`; `load` — восстановить последнее сохранение или файл `path`; `clear` — очистить Global |
| `wolfram_render` | Экспорт `Plot`/`Graphics` в PNG/SVG/PDF/JPG с `ImageResolution`; создаёт каталог, сам подгружает MaTeX, если он есть в выражении |
| `wolfram_batch` | Независимые фрагменты параллельно в отдельных ядрах (`maxParallel`, до 12) с отчётом OK/FAILED по каждому |
| `wolfram_ready` | Готов ли каталог к задаче: `AGENTS.md`/`tools`, окружение (что именно не найдено), git-репозиторий. `deep: true` дополнительно проверяет Python-пакеты (numpy, scipy, mpmath, sympy, pymupdf, python-docx) и установленные пакеты Mathematica (MaTeX, FeynCalc, FeynArts, xAct); необязательные пакеты перечисляются, но не делают `ok` ложным |
| `wolfram_check` | Статическая проверка кода через CodeInspector до запуска: ошибки синтаксиса и подозрительные места с номерами строк; принимает `code` или `path` к файлу. Режим скрипта по умолчанию скрывает шум `SuspiciousSessionSymbol` и `NonASCIICharacter` (Print/Set/Clear и кириллица в standalone-скрипте — норма), показывает счётчики по тегам и сколько скрыто; `strict: true` возвращает всё. Код не вычисляется |
| `wolfram_help` | Поиск символов в работающем ядре: usage, `ArgumentsPattern`, атрибуты, опции с умолчаниями. Подробный блок — только для точного совпадения, остальные — по строке; `options: false` убирает список опций |
| `wolfram_doc` | Раздел «Details» локальной страницы справки символа — офлайн и ровно для этой версии; страница кэшируется по символу, ищутся все разделы `ReferencePages` |
| `/wolfram-open` | Показать `.nb` в панели без сообщения модели |
| `/initmath` | Подготовить каталог расчётов (см. ниже) |
| `/mathsave`, `/mathcheck` | Закоммитить каталог сессии / только проверить окружение |
| Кнопка «Init Math» | Чип слева от ввода: запускает `/initmath` для каталога сессии и показывает отчёт (скопированные файлы + окружение) в поповере |
| Панель ноутбука | Заголовки, текст, входные клетки, формулы MathML, PNG-графика и сообщения справа от диалога |
| Постоянное ядро | Один `math.exe` на сессию; определения и переменные живут между вызовами |
| Экспорт `.nb` (по желанию) | `exportNotebook: true` сохраняет вычисление в настоящий `.nb` в `wolfram-notebooks/`; по умолчанию на диск ничего не пишется |

Интерфейс панели локализован: словари `en`, `ru` и `zh` в `client.js`, метаданные плагина —
`locale/en.json`, `locale/ru.json`, `locale/zh.json`. Язык берётся из настроек DSH
(«Настройки → Общие → Язык»), а не из репозитория.

## Как это устроено

```
Плагин Host (index.js)
  ├─ один процесс `math.exe -noprompt` на сессию
  ├─ bridge.wl: файловый JSON-протокол (файл запроса и файл ответа; в stdout — только маркеры)
  ├─ пишет результат в .dsh-wolfram/latest.json (publishedAt, MathML, base64 PNG)
  ├─ wolfram_job: отдельное ядро на задачу, долгий расчёт не блокирует ядро сессии
  └─ регистрирует инструменты wolfram_*
Плагин Client (client.js)
  ├─ регистрирует тип вкладки правой панели `wolfram-notebook` (+ запись в guide)
  ├─ опрашивает latest.json и обновляется при новом publishedAt
  └─ автоматически открывает панель, когда появляется новый документ
```

Почему CLI-мост, а не MCP-сервер: MCP требует отдельного пакета и процесса и даёт фиксированный
набор инструментов. Прямое управление ядром даёт контроль над версией Mathematica, форматами
вывода (MathML/PNG/TeX), состоянием сессии и документом панели без лишних зависимостей.

## Использование

Со стороны агента достаточно вызвать инструмент:

```
wolfram_eval  title="Задача Базеля"
cells=[
  {"type":"title","text":"Задача Базеля"},
  {"type":"input","code":"Sum[1/n^2, {n, 1, Infinity}]"},
  {"type":"input","code":"Plot[Sin[x]/x, {x, -10, 10}]"}
]
```

Панель открывается сама. Чтобы сохранить `.nb` для дальнейшей работы в Mathematica, добавьте
`"exportNotebook": true` — файл появится в `wolfram-notebooks/`.

Показать готовый ноутбук: `wolfram_notebook action="open" path="wolfram-notebooks/xxx.nb"`; то же
из панели — кнопка «Открыть…» и выбор файла из списка. `/wolfram-open <путь>` — командная форма.

### Каталог расчётов: `/initmath`

Считать лучше вне репозитория плагина, иначе результаты смешиваются с кодом. Каталог готовится
тремя способами:

- из сессии: `/initmath "D:\Projects\my-math"` (без аргумента — каталог сессии);
- из репозитория: `InitMath.cmd "D:\Projects\my-math"` (двойной щелчок спросит каталог; с
  аргументом скрипт отрабатывает без паузы);
- напрямую: `node scaffold.js "D:\Projects\my-math"`.

Копируется `workspace\` — `AGENTS.md` (правила сессии), `NOTES.md`, `README.md`, `.gitignore` и
`tools\` (сборка отчёта, проверка PDF, каркас задачи), создаются `tasks\` и `data\`. Существующие
файлы сохраняются без `--force`. Каталог внутри репозитория плагина отклоняется — в том числе
когда плагин запущен из установленной копии в `node_modules`.

Git-репозиторий создаётся с первым коммитом на ветке `main`; если есть `git-lfs`, сразу
включается LFS для `*.pdf`, `*.docx`, `*.png`, `*.jpg`, `*.jpeg`, `*.xlsx`, `*.svg`, `*.zip`.

`workspace\AGENTS.md` самодостаточен: правила Mathematica, рисунков и отчётов уже внутри, поэтому
глобальный `~/.dsh/AGENTS.md` для расчётов не нужен — на новой машине достаточно плагинов
`dsh-wolfram-nb` и `dsh-pdfconv`, затем `/initmath`.

Дальше: `node tools\new-task.mjs <имя> --title "Человеческое название"` — создаёт `TASK.md`,
`report.md`, `code.wl`, `_plots\`, `_work\`; расчёт инструментами `wolfram_*`; независимая
проверка через `tools\python.cmd` (Python 3.14: numpy/scipy/sympy/mpmath); отчёт
`tools\build-report.cmd`, проверка `tools\check-report.cmd report.pdf` (PDF+DOCX и `pdfcheck`).
Успешная сборка оставляет снимок версии в `_versions\<timestamp>\` (отключить `--no-snapshot`,
ручной снимок — `tools\snapshot.cmd`). Хранятся 20 последних (`--keep N`), идентичный снимок не
создаётся (`snapshot unchanged`; байты PDF/DOCX не сравниваются, только их наличие), `--force` создаёт принудительно. Артефакты сессии (`wolfram-plots\`,
`wolfram-notebooks\`, `.dsh-wolfram\`) пишутся в каталог сессии, а не в репозиторий.

## Проверка и сохранение результатов

```
wolfram_verify  action="identity"  lhs="Sin[x]^2 + Cos[x]^2"  rhs="1"  variables=["x"]
wolfram_verify  action="ode"  ode="y'[x] == y[x]"  solution="Exp[x]"  conditions=["y[0] == 1"]
wolfram_verify  action="integral"  integral="Integrate[Exp[-a x^2], {x, 0, Infinity}]"  result="Sqrt[Pi]/(2 Sqrt[a])"  assumptions="a > 0"
wolfram_verify  action="antiderivative"  integrand="Sin[x]"  result="-Cos[x]"
wolfram_state   action="save"              :: в .dsh-wolfram/state-<время>.mx
wolfram_state   action="load"              :: последнее сохранение; или path=".dsh-wolfram/my.mx"
wolfram_render  expr="Plot[Sin[x], {x, 0, 2 Pi}]"  format="svg"
```

Если `Integrate`/`Solve`/`DSolve` вернул выражение без изменений, ответ подсказывает следующий шаг
(`Reduce`, `NIntegrate`, `NDSolve`, …). Независимые прогоны — `wolfram_batch` (ядро на элемент).

## Настройка

Переопределите `config` строки в `cordis.patch.yml` профиля:

```yaml
- id: wolfram-notebook
  name: 'dsh-wolfram-nb'
  config:
    kernel: 'C:\Program Files\Wolfram Research\Wolfram\15.0\math.exe'
    timeoutMs: 180000
    idleMs: 1800000
    # kernelArgs: ['-pacletreadonly']
    # maxRunningJobs: 4
```

| Поле | По умолчанию | Смысл |
|---|---|---|
| `kernel` | автоопределение | Путь к `math.exe`, каталогу ядра или каталогу продукта с подкаталогами версий |
| `timeoutMs` | 180000 | Таймаут запроса; по истечении ядро убивается |
| `idleMs` | 1800000 | Сколько простаивающее ядро живёт до освобождения |
| `kernelArgs` | `[]` | Дополнительные аргументы `math.exe`, например `['-pacletreadonly']` против автопроверки обновлений |
| `maxRunningJobs` | `4` | Сколько задач идёт одновременно; остальные ждут в FIFO-очереди |

`wolfram_eval` принимает `timeoutMs` на вызов, переопределяя настройку; ошибки таймаута содержат
последние строки вывода ядра.

### Порядок поиска ядра

`kernel-discovery.js` пробует по порядку и останавливается на первом рабочем REPL:

1. `config.kernel` (exe, каталог ядра или каталог продукта; если задан, должен быть валиден);
2. переменные окружения `WOLFRAM_KERNEL` / `MATHEMATICA_KERNEL`;
3. записи Wolfram в реестре `HKLM/HKCU\SOFTWARE\Wolfram Research\Installations\*`
   (`ExecutablePath` / `InstallationDirectory` / `ProductVersion`, затем `math.exe` рядом,
   новые версии первыми);
4. стандартные каталоги `%ProgramFiles%`, `%ProgramW6432%`, `%ProgramFiles(x86)%`:
   `Wolfram Research\{Wolfram, Mathematica, Wolfram Engine, Wolfram Player}\<версия>`;
5. `math.exe` в `PATH` (обычно Wolfram Engine).

Поэтому работают установка в `D:\Apps\Wolfram\15.1`, несколько версий рядом и Wolfram Engine.
Явный путь нужен только портативной копии без записи в реестре:

```yaml
config:
  kernel: 'D:\Apps\Wolfram\15.1'
```

> Хостом ядра должен быть интерактивный `math.exe` / `MathKernel.exe` (читает выражения из stdin).
> `WolframNB.exe`, `wolfram.exe` и `WolframKernel.exe` используются только для поиска каталога и
> никогда не запускаются. Поиск через реестр — только Windows; на macOS/Linux задайте
> `config.kernel` или `WOLFRAM_KERNEL`.

`wolfram_notebook action="status"` показывает фактический путь ядра, способ обнаружения, версию
плагина и bridge — этого достаточно для диагностики.

## Где лежат данные

- `.dsh-wolfram/latest.json` — документ, который рисует панель (на рабочий каталог и сессию);
- `.dsh-wolfram/tmp/` — временные файлы запросов/ответов ядра (удаляются после каждого вызова) и
  `last-console.log` — полный вывод консоли последнего длинного `wolfram_eval`;
- `.dsh-wolfram/jobs/<id>.log` — полный лог каждой задачи `wolfram_job`;
- `.dsh-wolfram/batch/<run>/item-<n>.log` — консоль элементов `wolfram_batch`;
- `.dsh-wolfram/state-*.mx` — сохранения состояния;
- `wolfram-notebooks/*.nb` — экспортированные ноутбуки (только с `exportNotebook: true`);
- `wolfram-plots/` — рисунки `wolfram_render` по умолчанию.

## Кодировка

Все ядра (сессия, задача, batch, verify) стартуют с `bridge.wl`, который выставляет
`$CharacterEncoding = "UTF-8"` и кодировку `$Output`. Поэтому `Get` читает UTF-8 `.wl` без BOM,
`Print` с кириллицей доходит до результата без искажений, а подписи на рисунках из задачи
остаются читаемыми. При необходимости кодировку можно переопределить переменной окружения
`DSH_WOLFRAM_CHARACTER_ENCODING` (например, `WindowsCyrillic` для старых файлов без явной
кодировки); значение по умолчанию — всегда UTF-8.

## Известные ограничения

- Интерактивные конструкции фронтенда (`Manipulate`, `Dynamic`, сам интерфейс ноутбука) на веб-панели
  статичны: рисуются как формулы или текст.
- У части выражений (например, `Quantity`) нет MathML-экспорта; панель показывает `InputForm`, хотя
  ядро по-прежнему возвращает корректный TeX.
- Графике нужен фронтенд для растеризации: первый рисунок занимает 1–3 с.
- Сессии, работающие в одном каталоге, делят `latest.json` (ядра при этом у каждой свои).
- После загрузки страницы первое автооткрытие правой панели требует одного действия пользователя
  (или «+» → Wolfram notebook); дальше панель открывается сама.
- `.nb`, экспортированные ранними версиями, не восстановить: `MakeBoxes` внутри `Module` писал
  `value$…`. Текущая версия использует `ToBoxes` и корректна; старые ноутбуки нужно пересчитать.
- Декоративная графика и чекбоксы в таблицах справки `wolfram_doc` дают пустую строку, а операторы
  с пределами пишутся в математическом ASCII-виде (`Sum _i=1^i_maxf`).
- В `strict: true` сообщение CodeInspector о `NonASCIICharacter` печатает сам символ искажённо
  (`"Ñˆ"` вместо `"ш"`) — это внутренняя особенность CodeInspector; код символа в сообщении
  (`(\:0448)`) верный. По умолчанию эти замечания скрыты.

## Разработка

Протокол `bridge.wl`:

```
stdin:  WolframBridge`EvalFile["<путь к JSON запроса>"];
stdout: @@WB_READY@@<версия>
        @@WB_BEGIN@@<id>
        <строки Print/сообщений во время вычисления>
        @@WB_DOC@@<id>@@<путь к файлу ответа или base64>
```

JSON запроса пишется чистым ASCII (не-ASCII экранируется как `\uXXXX`), ответ — JSON в base64, что
снимает различия кодировок консоли Windows. После правки `bridge.wl` вызовите
`wolfram_notebook action="reset"` или перезапустите ядро; после правки `client.js` перезагрузите
плагин (в этом репозитории — переключением его состояния).

Проверки:

- `npm test` — 76 тестов против живого ядра, ~140 с;
- `node scripts/smoke.mjs` — поднимает плагин и вызывает каждый инструмент (~10 с); приёмка после
  установки, `--with-alpha` добавляет запрос к Wolfram|Alpha (нужна сеть);
- `build-tgz.bat` проверяет, что `package.json` — чистый UTF-8 без BOM (PowerShell `Set-Content
  -Encoding utf8` добавляет BOM, и `dsh plugin add` такой пакет отвергает);
- `DSH_WOLFRAM_ALLOW_BRIDGE_MISMATCH=1` позволяет держать ядро с другой версией `bridge.wl`
  (`wolfram_notebook action="status"` показывает расхождение);
- ядро, не ответившее `@@WB_BEGIN@@` за 5–20 с, считается зависшим и перезапускается — это закрывает
  и `ClearAll["*"]`, стирающий определения `WolframBridge``, и зависание внутри библиотечного вызова.

## Лицензия и товарные знаки

- Лицензия [MIT](LICENSE). Версии и история исправлений — [CHANGELOG.md](CHANGELOG.md).
- Плагин не связан с Wolfram Research и не одобрен ею; **Mathematica** и **Wolfram Language** —
  её товарные знаки, здесь использованы описательно.
- В поставку не входят Wolfram-компоненты, пакеты, документация и фирменные материалы; во время
  работы плагин управляет вашей собственной лицензионной Mathematica. Использование как
  многопользовательского вычислительного сервиса может противоречить лицензии Wolfram — решение
  за владельцем развёртывания.
