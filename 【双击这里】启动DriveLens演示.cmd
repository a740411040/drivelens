@echo off
setlocal EnableExtensions
title DriveLens Demo Launcher

set "START_SCRIPT="
for %%f in ("%~dp0*.ps1") do set "START_SCRIPT=%%~ff"
if not defined START_SCRIPT (
  echo [ERROR] PowerShell launcher was not found in the project folder.
  pause
  exit /b 1
)

echo Starting DriveLens at http://localhost:3001/ ...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%START_SCRIPT%"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [NOTICE] DriveLens stopped with exit code %EXIT_CODE%.
  pause
)

exit /b %EXIT_CODE%
