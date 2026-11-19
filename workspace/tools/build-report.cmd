@echo off
rem Build DOCX + PDF from a Markdown or LaTeX report via the local PDFConv project,
rem then snapshot the current task version into <task-dir>\_versions\<timestamp>\.
rem
rem Usage:
rem   tools\build-report.cmd <report.md|report.tex> [more ...]
rem   tools\build-report.cmd --check                     PDFConv environment report only
rem   tools\build-report.cmd --no-overwrite <files ...>  fail instead of replacing outputs
rem   tools\build-report.cmd --no-snapshot <files ...>   do not create _versions\<timestamp>\
rem   tools\build-report.cmd --keep <N> <files ...>       keep only the newest N snapshots (default 20)
rem
rem Outputs <name>.docx and <name>.pdf beside each source file. Existing outputs
rem are replaced (that is the normal rebuild); the script names each file it
rem replaces. --no-overwrite turns that into an error with exit code 3.
rem After a successful build every source directory gets exactly one snapshot
rem (see tools\version-snapshot.mjs); a failed build creates none.
setlocal EnableExtensions EnableDelayedExpansion
rem `shift` in the argument loop also shifts %0, so capture the script directory first.
set "TOOLS=%~dp0"
set "PDFCONV=D:\Projects\PDFConv\src\convert.py"

rem Python is pinned to 3.14 by absolute path: the `py` launcher resolves to 3.15 here
rem (no scientific stack) and a PATH lookup would silently pick the wrong interpreter.
set "PY=C:\Tools\Scripts\Python314\python.exe"
if defined DSH_PYTHON set "PY=%DSH_PYTHON%"
if not exist "%PY%" (
    echo [build-report] Python 3.14 not found: %PY%
    echo Install Python 3.14 or set DSH_PYTHON to an absolute python.exe path.
    exit /b 1
)

rem Node runs the snapshot helper; it is optional - without Node the build still succeeds.
set "NODE=C:\Program Files\nodejs\node.exe"
if defined DSH_NODE set "NODE=%DSH_NODE%"

set "GUARD="
set "FILES="
set "WHY="
set "NO_SNAPSHOT="
set "SNAP_KEEP="
set "KEEPARG="

:parse
if "%~1"=="" goto afterparse
if /I "%~1"=="--help" goto usage
if /I "%~1"=="-h" goto usage
if /I "%~1"=="--check" (
    if not defined WHY set "WHY=check"
    shift
    goto parse
)
if /I "%~1"=="--no-overwrite" (
    set "GUARD=1"
    shift
    goto parse
)
if /I "%~1"=="--no-snapshot" (
    set "NO_SNAPSHOT=1"
    shift
    goto parse
)
if /I "%~1"=="--keep" (
    set "SNAP_KEEP=%~2"
    shift
    shift
    goto parse
)
set "FILES=!FILES! "%~1""
shift
goto parse

:afterparse
if defined WHY (
    %PY% "%PDFCONV%" --check
    exit /b %ERRORLEVEL%
)
if not defined FILES goto usage

set "EXISTING="
for %%F in (%FILES%) do (
    for %%E in (docx pdf) do (
        if exist "%%~dpF%%~nF.%%E" (
            if defined GUARD (
                echo [build-report] refuses to replace existing output: %%F writes %%~nF.%%E
                set "EXISTING=1"
            ) else (
                echo [build-report] replacing existing %%~nF.%%E
            )
        )
    )
)
if defined EXISTING (
    echo [build-report] nothing converted; drop --no-overwrite to rebuild.
    exit /b 3
)

%PY% "%PDFCONV%" --formats docx,pdf %FILES%
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" exit /b %RESULT%

if defined NO_SNAPSHOT (
    echo [build-report] snapshot skipped: --no-snapshot
    exit /b 0
)
if not exist "%NODE%" (
    echo [build-report] warning: node not found at %NODE%; no _versions\ snapshot
    exit /b 0
)
if defined SNAP_KEEP set "KEEPARG=--keep %SNAP_KEEP%"

rem One snapshot per source directory: several files in one task must not create
rem several version directories. The directory name is sanitized into a variable
rem name to remember it (a plain "seen" string comparison was unreliable).
for %%F in (%FILES%) do (
    set "SNAPDIR=%%~dpF"
    set "SAFE=!SNAPDIR:\=_!"
    set "SAFE=!SAFE::=_!"
    set "SAFE=!SAFE: =#!"
    if not defined SNAP_!SAFE! (
        set "SNAP_!SAFE!=1"
        "%NODE%" "%TOOLS%version-snapshot.mjs" "%%~dpF." --source "%%~nxF" %KEEPARG%
    )
)
exit /b 0

:usage
echo Usage: build-report.cmd ^<report.md^> [more.md ...]
echo        build-report.cmd --check
echo        build-report.cmd --no-overwrite ^<report.md^> [more.md ...]
echo        build-report.cmd --no-snapshot ^<report.md^> [more.md ...]
echo        build-report.cmd --keep N ^<report.md^> [more.md ...]
echo Outputs ^<name^>.docx and ^<name^>.pdf next to each source file.
echo After a successful build each source directory gets one _versions\^<timestamp^>\ snapshot.
echo PDFConv supports .md, .markdown, .tex and .latex inputs.
exit /b 2

