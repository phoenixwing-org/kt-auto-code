@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "PNW_MODE=%~1"
shift
set "PNW_PROJECT="
set "PNW_VERSION="
set "PNW_RELATED="

:parse
if "%~1"=="" goto parsed
if /i "%~1"=="--project" (
  set "PNW_PROJECT=%~2"
  shift
  shift
  goto parse
)
if /i "%~1"=="--version" (
  set "PNW_VERSION=%~2"
  shift
  shift
  goto parse
)
if /i "%~1"=="--preq" (
  if defined PNW_RELATED (set "PNW_RELATED=%PNW_RELATED%;%~2") else set "PNW_RELATED=%~2"
  shift
  shift
  goto parse
)
echo [pnw-caa] unknown argument: %~1 1>&2
exit /b 2

:parsed
if /i not "%PNW_MODE%"=="mk" if /i not "%PNW_MODE%"=="run" (
  echo [pnw-caa] mode must be mk or run 1>&2
  exit /b 2
)
if not defined PNW_PROJECT (
  echo [pnw-caa] --project is required 1>&2
  exit /b 2
)
if not defined PNW_VERSION (
  echo [pnw-caa] --version is required 1>&2
  exit /b 2
)
echo(%PNW_VERSION%| %SystemRoot%\System32\findstr.exe /r /x "[0-9][0-9]*" >nul || (
  echo [pnw-caa] invalid version: %PNW_VERSION% 1>&2
  exit /b 2
)
if not exist "%PNW_PROJECT%\." (
  echo [pnw-caa] project does not exist: %PNW_PROJECT% 1>&2
  exit /b 3
)

set "PNW_BASE=C:\DS\RADE%PNW_VERSION%\intel_a"
set "PNW_TCK_INIT=%PNW_BASE%\code\command\tck_init.bat"
set "PNW_TCK_PROFILE=%PNW_BASE%\TCK\command\tck_profile.bat"
set "PNW_PROFILE=V5R%PNW_VERSION%_B%PNW_VERSION%"

call :require "%PNW_TCK_INIT%"
if errorlevel 1 exit /b %errorlevel%
call :require "%PNW_TCK_PROFILE%"
if errorlevel 1 exit /b %errorlevel%
cd /d "%PNW_PROJECT%"
if errorlevel 1 exit /b %errorlevel%

echo [pnw-caa] stage=tck-init
call "%PNW_TCK_INIT%"
if errorlevel 1 exit /b %errorlevel%
echo [pnw-caa] stage=tck-profile profile=%PNW_PROFILE%
call "%PNW_TCK_PROFILE%" "%PNW_PROFILE%"
if errorlevel 1 exit /b %errorlevel%

if /i "%PNW_MODE%"=="mk" goto build
goto run

:build
set "PNW_GET_PREQ=%PNW_BASE%\code\command\mkGetPreq.bat"
set "PNW_MKMK=%PNW_BASE%\code\command\mkmk.bat"
set "PNW_MKRTV=%PNW_BASE%\code\command\mkrtv.bat"
call :require "%PNW_GET_PREQ%"
if errorlevel 1 exit /b %errorlevel%
call :require "%PNW_MKMK%"
if errorlevel 1 exit /b %errorlevel%
call :require "%PNW_MKRTV%"
if errorlevel 1 exit /b %errorlevel%
set "PNW_PREQ=C:\DS\B%PNW_VERSION%;%PNW_PROJECT%"
if defined PNW_RELATED set "PNW_PREQ=%PNW_PREQ%;%PNW_RELATED%"
echo [pnw-caa] stage=preq
call "%PNW_GET_PREQ%" -p "%PNW_PREQ%"
if errorlevel 1 exit /b %errorlevel%
echo [pnw-caa] stage=mkmk
call "%PNW_MKMK%" -au
if errorlevel 1 exit /b %errorlevel%
echo [pnw-caa] stage=mkrtv
call "%PNW_MKRTV%"
if errorlevel 1 exit /b %errorlevel%
echo [pnw-caa] completed=mk
exit /b 0

:run
set "PNW_CREATE_RTV=%PNW_BASE%\code\command\mkCreateRuntimeView.bat"
set "PNW_MKRUN=%PNW_BASE%\code\command\mkrun.bat"
call :require "%PNW_CREATE_RTV%"
if errorlevel 1 exit /b %errorlevel%
call :require "%PNW_MKRUN%"
if errorlevel 1 exit /b %errorlevel%
echo [pnw-caa] stage=create-runtime-view
call "%PNW_CREATE_RTV%"
if errorlevel 1 exit /b %errorlevel%
echo [pnw-caa] stage=mkrun
call "%PNW_MKRUN%" -c "cnext"
if errorlevel 1 exit /b %errorlevel%
echo [pnw-caa] completed=run
exit /b 0

:require
if exist "%~1" exit /b 0
echo [pnw-caa] required vendor command is missing: %~1 1>&2
exit /b 4
