@echo off
rem Snapshot the current task files into <task-dir>\_versions\<timestamp>\.
rem
rem Usage:
rem   tools\snapshot.cmd <task-dir>
rem   tools\snapshot.cmd <task-dir> --source report.md
rem   tools\snapshot.cmd <task-dir> --keep 5 --force
rem
rem An identical snapshot is skipped ("snapshot unchanged"); --force creates it anyway.
rem build-report.cmd calls the same snapshot automatically after a successful build;
rem use this wrapper to keep a version before editing code.wl/report.md.
setlocal EnableExtensions
set "TOOLS=%~dp0"

rem Node is pinned by absolute path, like Python; DSH_NODE overrides it.
set "NODE=C:\Program Files\nodejs\node.exe"
if defined DSH_NODE set "NODE=%DSH_NODE%"
if not exist "%NODE%" (
  echo [snapshot] Node not found: %NODE%
  echo Install Node.js or set DSH_NODE to an absolute node.exe path.
  exit /b 1
)
if not exist "%TOOLS%version-snapshot.mjs" (
  echo [snapshot] version-snapshot.mjs not found next to this script: %TOOLS%version-snapshot.mjs
  exit /b 1
)
if "%~1"=="" goto usage
if /I "%~1"=="--help" goto usage
if /I "%~1"=="-h" goto usage

"%NODE%" "%TOOLS%version-snapshot.mjs" %*
exit /b %errorlevel%

:usage
echo Usage: snapshot.cmd ^<task-dir^> [--source ^<name^>] [--keep N] [--force]
echo   Copies TASK.md, report.md/.tex, *.wl, report.pdf/.docx and _plots/
echo   into ^<task-dir^>\_versions\^<YYYY_MM_DD-HH_MM_SS^>\ (sortable, never overwritten).
echo   Identical content is skipped; --keep N keeps only the newest N snapshots (default 20).
exit /b 2
