@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem ---------------------------------------------------------------------------
rem Target DSH installation.
rem
rem Desktop build on this machine lives in C:\Tools\DSH. For a Portable
rem Harness point DSH_CLI at that installation's runtime\cli\bin\dsh.cmd:
rem
rem   set "DSH_CLI=D:\Portable\DeepSeekHarness\runtime\cli\bin\dsh.cmd"
rem
rem If the portable copy keeps its own data (profiles, settings) outside
rem %USERPROFILE%\.dsh, also set DSH_HOME before installing.
rem
rem DSH_PROFILE is the profile name under %DSH_HOME%\profiles.
rem ---------------------------------------------------------------------------
if not defined DSH_CLI set "DSH_CLI=C:\Tools\DSH\resources\runtime\cli\bin\dsh.cmd"
if not defined DSH_PROFILE set "DSH_PROFILE=desktop"

set "DO_INSTALL="
if /I "%~1"=="install" set "DO_INSTALL=1"
if /I "%~1"=="--install" set "DO_INSTALL=1"
if not "%~1"=="" if not defined DO_INSTALL goto usage
rem Optional second argument overrides the target CLI without editing this file:
rem   build-tgz.bat install "D:\Portable\DeepSeekHarness\runtime\cli\bin\dsh.cmd"
if defined DO_INSTALL if not "%~2"=="" set "DSH_CLI=%~2"

call :build
if errorlevel 1 exit /b 1

if not defined DO_INSTALL (
  echo.
  echo [build-tgz] done: %TGZ%
  echo [build-tgz] install with: %~nx0 install
  exit /b 0
)

if not exist "%DSH_CLI%" (
  echo [build-tgz] DSH CLI not found: "%DSH_CLI%"
  echo [build-tgz] edit DSH_CLI at the top of this file, or set it in the environment.
  exit /b 1
)

rem pnpm wants a file: spec with forward slashes.
set "TGZ_FWD=%TGZ:\=/%"
echo.
if defined DSH_HOME (
  echo [build-tgz] DSH_HOME: %DSH_HOME%
) else (
  echo [build-tgz] DSH_HOME is not set; the CLI uses its default home.
)
echo [build-tgz] installing into profile "%DSH_PROFILE%":
echo   "%DSH_CLI%" plugin --profile "%DSH_PROFILE%" add "file:%TGZ_FWD%"
call "%DSH_CLI%" plugin --profile "%DSH_PROFILE%" add "file:%TGZ_FWD%"
if errorlevel 1 (
  echo.
  echo [build-tgz] install failed.
  exit /b 1
)

echo.
echo [build-tgz] installed. Restart DSH completely to load the new build.
exit /b 0

:build
where node >nul 2>nul
if errorlevel 1 (
  echo [build-tgz] node not found in PATH.
  exit /b 1
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [build-tgz] npm.cmd not found in PATH.
  exit /b 1
)

set "VERSION="
for /f "usebackq delims=" %%v in (`node -p "require('./package.json').version"`) do set "VERSION=%%v"
if not defined VERSION (
  echo [build-tgz] cannot read the version from package.json.
  exit /b 1
)

set "PKGNAME="
for /f "usebackq delims=" %%n in (`node -p "require('./package.json').name.replace('@','').replace('/','-')"`) do set "PKGNAME=%%n"
if not defined PKGNAME (
  echo [build-tgz] cannot read the package name from package.json.
  exit /b 1
)

del /q *.tgz >nul 2>nul
echo [build-tgz] packing %PKGNAME% %VERSION%
call npm pack
if errorlevel 1 (
  echo [build-tgz] npm pack failed.
  exit /b 1
)

set "TGZ=%CD%\%PKGNAME%-%VERSION%.tgz"
if not exist "%TGZ%" (
  set "TGZ2="
  for /f "delims=" %%f in ('dir /b /o-d *.tgz 2^>nul') do if not defined TGZ2 set "TGZ2=%CD%\%%f"
  if not defined TGZ2 (
    echo [build-tgz] npm pack did not create a .tgz.
    exit /b 1
  )
  set "TGZ=%TGZ2%"
)
exit /b 0

:usage
echo usage: %~nx0 [install [dsh.cmd]]
echo   no argument  build dsh-wolfram-nb-^<version^>.tgz
echo   install      build, then install it through the target DSH CLI
echo   dsh.cmd      optional DSH CLI to install into (overrides DSH_CLI above)
exit /b 2
