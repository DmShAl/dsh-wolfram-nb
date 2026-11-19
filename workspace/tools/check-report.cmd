@echo off
rem Check that report.pdf and its report.docx exist, then run pdfcheck.cmd on the PDF.
rem
rem Usage:
rem   tools\check-report.cmd <report.pdf>                 PDF+DOCX exist, then pdfcheck --pages 1
rem                                                       with pages rendered into <pdf-dir>\_work
rem   tools\check-report.cmd <report.pdf> --pages 1,3     extra arguments go to pdfcheck.cmd
rem
rem Exit codes: 0 OK, 1 missing PDF/DOCX, 2 pdfcheck.cmd missing, otherwise pdfcheck's code.
setlocal EnableExtensions EnableDelayedExpansion
rem `shift` also shifts %0, so the script directory must be captured before it.
set "TOOLS=%~dp0"
if "%~1"=="" goto usage
if /I "%~1"=="--help" goto usage
if /I "%~1"=="-h" goto usage

set "PDF=%~1"
set "PDFDIR=%~dp1"
set "DOCX=%~dpn1.docx"
if not exist "%PDF%" (
  echo [check-report] PDF not found: %PDF%
  echo Build it first: tools\build-report.cmd ^<report.md^|report.tex^>
  exit /b 1
)
if not exist "%DOCX%" (
  echo [check-report] DOCX not found: %DOCX%
  echo Build it first: tools\build-report.cmd ^<report.md^|report.tex^>
  exit /b 1
)
if not exist "%TOOLS%pdfcheck.cmd" (
  echo [check-report] pdfcheck.cmd not found next to this script: %TOOLS%pdfcheck.cmd
  exit /b 2
)

shift
set "ARGS="
:collect
if "%~1"=="" goto run
set "ARGS=%ARGS% %1"
shift
goto collect

:run
rem Default: render page 1 into the task's _work/ so page1.png does not land next to
rem the report. With explicit arguments the caller decides, including --out.
if not defined ARGS set "ARGS=--pages 1 --out "%PDFDIR%_work""
echo [check-report] OK: PDF and DOCX exist
echo   PDF : %PDF%
echo   DOCX: %DOCX%
call "%TOOLS%pdfcheck.cmd" "%PDF%" %ARGS%
exit /b %errorlevel%

:usage
echo Usage: check-report.cmd ^<report.pdf^> [pdfcheck arguments ...]
echo   Checks that report.pdf and report.docx exist, then runs pdfcheck.cmd.
echo   Default: --pages 1 --out ^<pdf-dir^>\_work (no page1.png next to the report);
echo   explicit arguments are forwarded as-is. Exit code is pdfcheck's.
exit /b 2
