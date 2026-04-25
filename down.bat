@echo off
title AMS - Stopping Services
echo  Stopping Biometric Agent...
for /f "tokens=5" %%p in ('netstat -aon 2^>nul ^| findstr ":12345 "') do (
    taskkill /PID %%p /F >nul 2>&1
)
echo  Stopping Docker containers...
docker compose down
echo  All services stopped.
pause
