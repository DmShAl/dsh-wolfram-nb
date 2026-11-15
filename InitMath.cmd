@echo off
chcp 65001>nul
setlocal EnableExtensions
cd /d "%~dp0"
rem Prepare a folder for Wolfram calculations: copies AGENTS.md, NOTES.md,
rem README.md, .gitignore and tools\ from workspace\, and creates tasks\ + data\.
rem Usage: InitMath.cmd "D:\path\to\folder" [--force]
if not "%~1"=="" goto run
echo usage: %~nx0 "D:\path\to\folder" [--force]
echo.
set /p "TARGET=Folder: "
if not defined TARGET exit /b 2
node "%~dp0scaffold.js" "%TARGET%"
goto done
:run
node "%~dp0scaffold.js" %*
:done
echo.
echo Exit code: %ERRORLEVEL%
pause
exit /b %ERRORLEVEL%
