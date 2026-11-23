@echo off
setlocal
set "PATH=%ProgramFiles%\GitHub CLI;%ProgramFiles%\Git\cmd;%ProgramFiles%\nodejs;%APPDATA%\npm;%LOCALAPPDATA%\pnpm;%PATH%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0release-latest.ps1" %*
set "result=%ERRORLEVEL%"
if not "%result%"=="0" pause
exit /b %result%
