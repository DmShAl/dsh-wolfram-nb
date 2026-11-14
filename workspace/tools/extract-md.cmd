@echo off
rem Convert a DOCX with formulas back to Markdown + LaTeX via the local PDFConv
rem project: <name>.docx -> <name>.md and <name>.media\ (extracted pictures).
rem
rem Usage:
rem   tools\extract-md.cmd <file.docx> [more ...]      refuse to replace an existing .md
rem   tools\extract-md.cmd --force <file.docx> ...     replace it
rem
rem MathType equations must be translated to LaTeX (Cyrillic) in Word first;
rem otherwise they come back as objects, not formulas. Exit code 3 means the
rem Markdown already exists and --force was not given.
setlocal EnableExtensions EnableDelayedExpansion
set "PDFCONV=D:\Projects\PDFConv\src\convert.py"

where py >nul 2>nul
if errorlevel 1 (set "PY=python") else (set "PY=py -3")

set "FORCE="
set "FILES="

:parse
if "%~1"=="" goto afterparse
if /I "%~1"=="--help" goto usage
if /I "%~1"=="-h" goto usage
if /I "%~1"=="--force" (
    set "FORCE=1"
    shift
    goto parse
)
set "FILES=!FILES! "%~1""
shift
goto parse

:afterparse
if not defined FILES goto usage

set "EXISTING="
for %%F in (%FILES%) do (
    if not defined FORCE (
        if exist "%%~dpF%%~nF.md" (
            echo [extract-md] %%~nF.md already exists; pass --force to replace it
            set "EXISTING=1"
        )
    )
)
if defined EXISTING (
    echo [extract-md] nothing converted.
    exit /b 3
)

%PY% "%PDFCONV%" --formats md %FILES%
exit /b %ERRORLEVEL%

:usage
echo Usage: extract-md.cmd ^<file.docx^> [more.docx ...]
echo        extract-md.cmd --force ^<file.docx^> [more.docx ...]
echo Writes ^<name^>.md and ^<name^>.media next to each source file.
echo MathType formulas need the LaTeX (Cyrillic) translator in Word first.
exit /b 2
