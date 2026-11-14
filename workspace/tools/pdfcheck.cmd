@echo off
rem Wrapper: run tools\pdfcheck.py with a UTF-8 console (otherwise Cyrillic
rem from the PDF text layer shows up as mojibake on Windows).
chcp 65001 >nul
setlocal
if exist "C:\Tools\Scripts\Python314\python.exe" (
  "C:\Tools\Scripts\Python314\python.exe" "%~dp0pdfcheck.py" %*
) else (
  python "%~dp0pdfcheck.py" %*
)
exit /b %errorlevel%
