# Выпуск версии

Порядок для этой ветки: сборка ставится из локального tarball в профиль DSH и пушится в
`DmShAl/dsh-wolfram-nb`. Публикация в npm от имени nashihang777 здесь не выполняется: пакет в npm —
это исходный проект, а не эта сборка.

## 1. Подготовка

1. Поднимите `version` в `package.json` (например, `1.15.0` → `1.15.1`).
2. Добавьте запись в [CHANGELOG.md](CHANGELOG.md): что добавлено, что исправлено, сколько тестов.
3. Если менялись инструменты, обновите [README.md](README.md) и [README.en.md](README.en.md);
   `README.zh.md` — архивный текст upstream, его не трогаем.
4. Если менялись метаданные плагина, проверьте `locale/en.json`, `locale/ru.json`, `locale/zh.json`.

## 2. Проверка

```bat
npm.cmd test                 :: 66 тестов против живого ядра, ~110 с
build-tgz.bat install        :: собрать и поставить в профиль desktop
node scripts/smoke.mjs       :: 11 шагов, ~10 с
```

`build-tgz.bat install` сам проверяет, что `package.json` — чистый UTF-8 без BOM (иначе
`dsh plugin add` отвергнет пакет), собирает tgz, снимает предыдущую версию
(`dsh plugin remove`) и ставит новую. Удаление обязательно: pnpm иначе оставляет файлы прежней
сборки, если номер версии не изменился.

После установки **полностью перезапустите DSH** и убедитесь, что загружена новая сборка:

```
wolfram_notebook action="status"   →  Plugin <новая версия>, bridge 1.3.4 …
```

## 3. Коммит и тег

```bat
git add -A
git commit -m "feat: <что сделано> (<версия>)"
git tag -a v<версия> -m "<версия>: <короткая суть>"
git push origin main
git push origin v<версия>
```

Тег обязателен: по нему видно, какая именно сборка ушла в профиль. `.github/workflows` в этой
ветке нет, поэтому тег ничего не публикует — он только фиксирует состояние репозитория.

## 4. Проверка после выпуска

- `git log --oneline -1` и `git ls-remote --tags origin v<версия>` показывают коммит и тег.
- `wolfram_ready` в каталоге расчётов: окружение 6/6, git чистый.
- Приватный журнал: запись в `dsh-wolfram-nb_Priv/notes/LEDGER.md` рядом с репозиторием.

## Частые ловушки

- **LF в `.cmd`**: `InitMath.cmd` и `build-tgz.bat` должны быть с CRLF, иначе cmd ломает разбор
  (`'isting' is not recognized`). Записывая файл из PowerShell, используйте
  `[System.Text.UTF8Encoding]::new($false)` и перевод строки `\r\n`.
- **BOM в `package.json`**: `Set-Content -Encoding utf8` в PowerShell 5.1 добавляет BOM, и
  установка падает. Пишите через `node -e` или с `-Encoding utf8NoBOM`.
- **Старые файлы в профиле**: без `dsh plugin remove` перед `add` профиль может продолжать
  показывать код предыдущей сборки с тем же номером версии.
- **Метаданные репозитория**: `repository`/`homepage`/`bugs` в `package.json` должны указывать на
  `DmShAl/dsh-wolfram-nb`; npm-пакет upstream упоминается только в тексте README.
