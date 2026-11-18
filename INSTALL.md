# Установка плагина из локальной сборки

`build-tgz.bat` собирает npm-пакет (`npm pack`) и, с аргументом `install`, ставит его в профиль
DSH через `dsh plugin ... remove` + `add file:<tgz>`.

## Требования

- Windows;
- `node` и `npm.cmd` в `PATH`;
- DSH (Desktop или Portable) с `dsh.cmd`;
- Mathematica или Wolfram Engine с `math.exe` (в tgz Wolfram-компонентов нет).

## Быстрый старт

```bat
build-tgz.bat            :: только собрать tgz
build-tgz.bat install    :: собрать и установить в профиль desktop
```

После установки **полностью перезапустите DSH**: инструменты `wolfram_*` иногда появляются и без
рестарта, но клиентская часть (панель, кнопка «Подготовить», словари) загружается только при
старте.

Проверка:

```
wolfram_notebook action="status"   →  Plugin 1.16.2, bridge: 1.3.5 (Mathematica 15.x)
node scripts/smoke.mjs             →  11/11 steps passed
```

## Что делает скрипт

1. Читает `name`/`version` из `package.json`.
2. Проверяет, что `package.json` — чистый UTF-8 без BOM (`scripts/check-package.js`); с BOM
   `dsh plugin add` пакет отвергает.
3. Удаляет старые `*.tgz` и запускает `npm pack`
   (`dsh-wolfram-nb-<version>.tgz`).
4. С аргументом `install` вызывает:

   ```bat
   dsh plugin --profile desktop remove dsh-wolfram-nb
   dsh plugin --profile desktop add "file:<абсолютный путь к tgz>"
   ```

   Удаление перед установкой обязательно: pnpm иначе оставляет файлы прежней сборки, если номер
   версии не изменился. DSH (pnpm) добавляет `file:`-зависимость в
   `%DSH_HOME%\profiles\<profile>\package.json` и регистрирует бандл в `dsh.profile.bundles`.

## Параметры и переменные

| Что | Значение по умолчанию |
|---|---|
| `DSH_CLI` | `C:\Tools\DSH\resources\runtime\cli\bin\dsh.cmd` |
| `DSH_PROFILE` | `desktop` |
| `DSH_HOME` | не задан — CLI использует `%USERPROFILE%\.dsh` |

Второй аргумент переопределяет CLI без редактирования файла:

```bat
build-tgz.bat install "D:\Portable\DeepSeekHarness\runtime\cli\bin\dsh.cmd"
```

Portable Harness со своими данными:

```bat
set "DSH_HOME=D:\Portable\DeepSeekHarness\data"
set "DSH_PROFILE=desktop"
build-tgz.bat install "D:\Portable\DeepSeekHarness\runtime\cli\bin\dsh.cmd"
```

## Проверка после установки

- `wolfram_notebook action="status"` — путь к ядру, версия плагина и bridge, счётчики;
- `wolfram_eval` с `1+1` — должно вернуть `2`;
- `wolfram_ready` в каталоге расчётов — окружение 6/6;
- в профиле: `dsh plugin --profile desktop list` или **Plugins** в GUI;
- версия на диске: `node -p "require(process.env.USERPROFILE + '/.dsh/profiles/desktop/node_modules/dsh-wolfram-nb/package.json').version"`.

## Обновление

Поднимите `version` в `package.json`, затем снова `build-tgz.bat install` — скрипт сам снимет
старую версию и поставит новую.

## Удаление

```bat
dsh plugin --profile desktop remove dsh-wolfram-nb
```

pnpm удалит пакет из зависимостей; запись `dsh-wolfram-nb` в `dsh.profile.bundles` при
необходимости уберите через **Plugins** в GUI (или отредактируйте `package.json` профиля вручную —
только после удаления пакета).

## Ручной вариант без скрипта

```bat
npm pack
dsh plugin --profile desktop add "file:%CD%\dsh-wolfram-nb-1.15.0.tgz"
```

Или в GUI: **Plugins → Add plugin** → каталог этого репозитория. Пакет
`nashihang777-dsh-wolfram-nb` в npm — исходный проект, а не эта сборка.
