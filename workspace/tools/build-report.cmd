@echo off
rem Build DOCX + PDF from a Markdown or LaTeX report via the local PDFConv project.
rem
rem Usage:
rem   tools\build-report.cmd <report.md|report.tex> [more ...]
rem   tools\build-report.cmd --check                     PDFConv environment report only
rem   tools\build-report.cmd --no-overwrite <files ...>  fail instead of replacing outputs
rem
rem Outputs <name>.docx and <name>.pdf beside each source file. Existing outputs
rem are replaced (that is the normal rebuild); the script names each file it
rem replaces. --no-overwrite turns that into an error with exit code 3.
setlocal EnableExtensions EnableDelayedExpansion
set "PDFCONV=D:\Projects\PDFConv\src\convert.py"

where py >nul 2>nul
if errorlevel 1 (set "PY=python") else (set "PY=py -3")

set "GUARD="
set "FILES="
set "WHY="

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
exit /b %ERRORLEVEL%

:usage
echo Usage: build-report.cmd ^<report.md^> [more.md ...]
echo        build-report.cmd --check
echo        build-report.cmd --no-overwrite ^<report.md^> [more.md ...]
echo Outputs ^<name^>.docx and ^<name^>.pdf next to each source file.
echo PDFConv supports .md, .markdown, .tex and .latex inputs.
exit /b 2
