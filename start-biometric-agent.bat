@echo off
:: AMS Biometric Agent — start as detached background process
:: Run this once after booting your PC before using the AMS app.

echo Checking if agent is already running...
curl -s http://localhost:12345/health >nul 2>&1
if %errorlevel% == 0 (
    echo Agent is already running on port 12345.
    pause
    exit /b 0
)

echo Starting AMS Biometric Agent...
cd /d "%~dp0biometric-agent"
start "" /B node server.js

:: Wait up to 5 seconds for it to start
timeout /t 3 /nobreak >nul
curl -s http://localhost:12345/health >nul 2>&1
if %errorlevel% == 0 (
    echo.
    echo  Biometric Agent started successfully!
    echo  Device: ws://localhost:12345
    echo  Health: http://localhost:12345/health
) else (
    echo.
    echo  Agent may still be starting. Check http://localhost:12345/health in a moment.
)
echo.
pause
