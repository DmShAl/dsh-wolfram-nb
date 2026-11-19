@echo off
rem Wrapper: run tools\pdfcheck.py with a UTF-8 console (otherwise Cyrillic
rem from the PDF text layer shows up as mojibake on Windows).
chcp 65001 >nul
rem Python is pinned to 3.14 by absolute path (no `py`/PATH fallback).
setlocal
set "PY=C:\Tools\Scripts\Python314\python.exe"
if defined DSH_PYTHON set "PY=%DSH_PYTHON%"
if not exist "%PY%" (
  echo [pdfcheck] Python 3.14 not found: %PY%
  echo Install Python 3.14 or set DSH_PYTHON to an absolute python.exe path.
  exit /b 1
)
"%PY%" "%~dp0pdfcheck.py" %*
exit /b %errorlevel%
