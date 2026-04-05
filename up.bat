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

:: ── Start ─────────────────────────────────────────────────────────────────────
echo [AMS] Starting all services...
docker compose up -d
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to start. Is Docker Desktop running?
    pause
    exit /b 1
)

echo.
echo  Services are starting. Backend runs migrations automatically.
echo  Wait ~30 seconds then open: http://localhost:5173
echo.
echo  Watch logs:  docker compose logs -f backend
echo.
echo  Fingerprint agent - open a new CMD window:
echo    cd biometric-agent
echo    npm start
echo.
pause
