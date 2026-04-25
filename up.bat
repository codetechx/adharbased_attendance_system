@echo off
title AMS - Starting Services

:: ── Create .env if missing ────────────────────────────────────────────────────
if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo [AMS] Created .env from .env.example
)

:: ── Generate APP_KEY if blank ─────────────────────────────────────────────────
findstr /R "^APP_KEY=$" ".env" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [AMS] Generating APP_KEY...
    for /f "delims=" %%K in ('powershell -NoProfile -Command "[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))"') do set GENERATED_KEY=%%K
    powershell -NoProfile -Command "(Get-Content '.env') -replace '^APP_KEY=.*', 'APP_KEY=base64:%GENERATED_KEY%' | Set-Content '.env'"
    echo [AMS] APP_KEY saved to .env
)

:: ── Start Docker ──────────────────────────────────────────────────────────────
echo [AMS] Starting Docker containers...
docker compose up -d
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to start. Is Docker Desktop running?
    pause
    exit /b 1
)

:: ── SGIBIOSRV Proxy ───────────────────────────────────────────────────────────
echo [AMS] Starting SGIBIOSRV proxy (http://localhost:12345)...

:: Kill anything already on port 12345
for /f "tokens=5" %%p in ('netstat -aon 2^>nul ^| findstr ":12345 "') do (
    taskkill /PID %%p /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

powershell -NoProfile -Command ^
  "Start-Process py ^
     -ArgumentList '-3 sgibiosrv_proxy.py' ^
     -WorkingDirectory '%~dp0biometric-agent' ^
     -WindowStyle Hidden ^
     -RedirectStandardOutput '%~dp0biometric-agent\agent.log' ^
     -RedirectStandardError  '%~dp0biometric-agent\agent-error.log'"

timeout /t 3 /nobreak >nul
curl -s http://localhost:12345/health >nul 2>&1
if %errorlevel% == 0 (
    echo [AMS] SGIBIOSRV proxy is running.
) else (
    echo [AMS] Proxy still starting — check http://localhost:12345/health
)

echo.
echo  ============================================================
echo   AMS is ready!
echo.
echo   App   :  http://localhost
echo   Agent :  http://localhost:12345/health
echo   Logs  :  biometric-agent\agent.log
echo  ============================================================
echo.
pause
