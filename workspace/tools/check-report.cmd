@echo off
rem Check that report.pdf and its report.docx exist, then run pdfcheck.cmd on the PDF.
rem
rem Usage:
rem   tools\check-report.cmd <report.pdf>                 PDF+DOCX exist, then pdfcheck --pages 1
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
if not defined ARGS set "ARGS=--pages 1"
echo [check-report] OK: PDF and DOCX exist
echo   PDF : %PDF%
echo   DOCX: %DOCX%
call "%TOOLS%pdfcheck.cmd" "%PDF%" %ARGS%
exit /b %errorlevel%

:usage
echo Usage: check-report.cmd ^<report.pdf^> [pdfcheck arguments ...]
echo   Checks that report.pdf and report.docx exist, then runs pdfcheck.cmd
echo   (default: --pages 1) and forwards its exit code.
exit /b 2
