@echo off
setlocal EnableExtensions
title DriveLens Demo Launcher

set "PROJECT_DIR=%~dp0"
set "START_SCRIPT="
for %%F in ("%PROJECT_DIR%*.ps1") do set "START_SCRIPT=%%~fF"

if not defined START_SCRIPT (
  echo [ERROR] PowerShell launcher was not found in the project folder.
  pause
  exit /b 1
)

echo Starting DriveLens. Please wait...
echo Close the separate server window when the demo is finished.

start "DriveLens Demo Server - close to stop" powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%START_SCRIPT%"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ports=3000..3010; for($i=0;$i -lt 80;$i++){ foreach($p in $ports){ try{$r=Invoke-WebRequest -UseBasicParsing -Uri ('http://localhost:{0}/' -f $p) -TimeoutSec 1; if($r.StatusCode -ge 200 -and $r.Content -match 'DriveLens'){Start-Process ('http://localhost:{0}/' -f $p); exit 0}}catch{} }; Start-Sleep -Milliseconds 500 }; exit 1"

if errorlevel 1 (
  echo.
  echo [NOTICE] The server did not become ready within 40 seconds.
  echo Check the separate DriveLens server window for the error message.
  pause
  exit /b 1
)

exit /b 0
