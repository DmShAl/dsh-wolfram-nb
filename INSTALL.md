# Установка плагина из локальной сборки

Скрипт `build-tgz.bat` собирает npm-пакет (`npm pack`) и, с аргументом `install`,
устанавливает его в профиль DSH через `dsh plugin ... add file:<tgz>`.

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

После установки полностью перезапустите DSH. В текущей сессии бандл часто
подхватывается сразу (инструменты `wolfram_*` появляются без рестарта), но рестарт
гарантирует загрузку client-части и настроек.

## Что делает скрипт

1. Читает `name`/`version` из `package.json`.
2. Удаляет старые `*.tgz` и запускает `npm pack`
   (`nashihang777-dsh-wolfram-nb-<version>.tgz`).
3. С аргументом `install` вызывает:

   ```bat
   dsh plugin --profile desktop add "file:<абсолютный путь к tgz>"
   ```

   DSH (pnpm) добавляет зависимость в `%DSH_HOME%\profiles\<profile>\package.json`
   и регистрирует бандл в `dsh.profile.bundles`.

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

- `wolfram_notebook action="status"` — путь к ядру и версия bridge;
- `wolfram_eval` с `1+1` — должно вернуть `2`;
- в профиле: `dsh plugin --profile desktop list` или **Plugins** в GUI.

## Обновление

Поднимите `version` в `package.json`, затем снова `build-tgz.bat install` —
pnpm обновит `file:`-зависимость на новый tgz.

## Удаление

```bat
dsh plugin --profile desktop remove dsh-wolfram-nb
```

pnpm удалит пакет из зависимостей; запись `dsh-wolfram-nb`
в `dsh.profile.bundles` при необходимости уберите через **Plugins** в GUI
(или отредактируйте `package.json` профиля вручную — только после удаления пакета).

## Ручной вариант без скрипта

```bat
npm pack
dsh plugin --profile desktop add "file:%CD%\nashihang777-dsh-wolfram-nb-1.6.0.tgz"
```

Или в GUI: **Plugins → Add plugin** → каталог этого репозитория.
