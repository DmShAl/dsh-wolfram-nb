@echo off
rem Run Python 3.14 by absolute path (no py/pyw launcher, no PATH lookup).
rem
rem Usage:
rem   tools\python.cmd -c "import sympy; print(sympy.__version__)"
rem   tools\python.cmd script.py [args ...]
chcp 65001 >nul
setlocal
set "PY=C:\Tools\Scripts\Python314\python.exe"
if defined DSH_PYTHON set "PY=%DSH_PYTHON%"
if not exist "%PY%" (
  echo [python] Python 3.14 not found: %PY%
  echo Install Python 3.14 or set DSH_PYTHON to an absolute python.exe path.
  exit /b 1
)
"%PY%" %*
exit /b %errorlevel%
