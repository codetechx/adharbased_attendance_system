@echo off
title AMS - First Time Setup
color 0A

echo.
echo  =====================================================
echo   AMS - Attendance Management System
echo   First-time setup
echo  =====================================================
echo.

:: ── Check Docker is installed ─────────────────────────────────────────────────
where docker >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] Docker not found.
    echo  Install Docker Desktop: https://www.docker.com/products/docker-desktop/
    echo.
    pause
    exit /b 1
)

:: ── Check Docker is running ───────────────────────────────────────────────────
docker info >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] Docker is not running.
    echo  Start Docker Desktop, wait for it to fully load, then run this again.
    echo.
    pause
    exit /b 1
)
echo  [OK] Docker is running.

:: ── Create .env from .env.example ────────────────────────────────────────────
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo  [OK] Created .env from .env.example
    ) else (
        echo  [ERROR] .env.example not found. Cannot create .env.
        pause
        exit /b 1
    )
) else (
    echo  [OK] .env already exists.
)

:: ── Generate APP_KEY if blank ─────────────────────────────────────────────────
:: Laravel requires a 32-byte base64 key. Generate it with PowerShell
:: (no local PHP needed) and write it into .env before docker compose starts.
:: Check if APP_KEY= line is empty (has nothing after the =)
findstr /R "^APP_KEY=$" ".env" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo  [INFO] Generating APP_KEY...
    for /f "delims=" %%K in ('powershell -NoProfile -Command "[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))"') do set GENERATED_KEY=%%K
    :: Replace the APP_KEY= line in .env
    powershell -NoProfile -Command ^
        "(Get-Content '.env') -replace '^APP_KEY=.*', 'APP_KEY=base64:%GENERATED_KEY%' | Set-Content '.env'"
    echo  [OK] APP_KEY generated and saved to .env
) else (
    echo  [OK] APP_KEY already set.
)

:: ── Build Docker images ───────────────────────────────────────────────────────
echo.
echo  [STEP 1/5] Building Docker images...
echo  (First run takes 3-5 minutes)
echo.
docker compose build
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  [ERROR] Docker build failed. See errors above.
    pause
    exit /b 1
)

:: ── Start services ────────────────────────────────────────────────────────────
echo.
echo  [STEP 2/5] Starting services...
docker compose up -d
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  [ERROR] Failed to start services.
    pause
    exit /b 1
)

:: ── Wait for MySQL ────────────────────────────────────────────────────────────
echo.
echo  [STEP 3/5] Waiting for MySQL (up to 60 seconds)...
set /a attempt=0
:wait_mysql
    set /a attempt+=1
    if %attempt% GTR 30 (
        echo.
        echo  [ERROR] MySQL did not become ready.
        echo  Check: docker compose logs mysql
        pause
        exit /b 1
    )
    docker compose exec -T mysql mysqladmin ping -h localhost --silent >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        <nul set /p =.
        timeout /t 2 /nobreak >nul
        goto wait_mysql
    )
echo.
echo  [OK] MySQL is ready.

:: ── Laravel setup ─────────────────────────────────────────────────────────────
echo.
echo  [STEP 4/5] Laravel setup...

echo    Running migrations and seeders...
docker compose exec -T backend php artisan migrate --seed --force
if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] Migration failed.
    echo  Check: docker compose logs backend
    pause
    exit /b 1
)

echo    Creating storage symlink...
docker compose exec -T backend php artisan storage:link --force >nul 2>&1

echo    Caching config...
docker compose exec -T backend php artisan config:cache >nul 2>&1

echo  [OK] Laravel ready.

:: ── Biometric agent (Python WBF) ──────────────────────────────────────────────
echo.
echo  [STEP 5/5] Starting Biometric Agent (WBF / HU20-AP)...
where py >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    py -3 -m pip install websockets --quiet

    :: Kill any stale agent first
    for /f "tokens=5" %%p in ('netstat -aon 2^>nul ^| findstr ":12345 "') do (
        taskkill /PID %%p /F >nul 2>&1
    )
    timeout /t 1 /nobreak >nul

    powershell -NoProfile -Command ^
      "Start-Process py ^
         -ArgumentList '-3 winbio_server.py' ^
         -WorkingDirectory '%~dp0biometric-agent' ^
         -WindowStyle Hidden ^
         -RedirectStandardOutput '%~dp0biometric-agent\agent.log' ^
         -RedirectStandardError  '%~dp0biometric-agent\agent-error.log'"

    timeout /t 4 /nobreak >nul
    curl -s http://localhost:12345/health >nul 2>&1
    if %errorlevel% == 0 (
        echo  [OK] Biometric Agent is running ^(WBF mode^).
    ) else (
        echo  [INFO] Agent still starting — check http://localhost:12345/health
    )
) else (
    echo  [WARN] Python not found. Install Python 3.10+: https://python.org
    echo         Then run start-winbio-agent.bat from the biometric-agent folder.
)

:: ── Done ──────────────────────────────────────────────────────────────────────
echo.
echo  =====================================================
echo   SETUP COMPLETE
echo  =====================================================
echo.
echo   App       : http://localhost
echo   API       : http://localhost/api
echo   Agent     : http://localhost:12345/health
echo   PDF Svc   : http://localhost:8001/health
echo.
echo   Login credentials:
echo     superadmin@ams.local  /  Admin@12345
echo     company@ams.local     /  Admin@12345
echo     gate@ams.local        /  Admin@12345
echo     vendor@ams.local      /  Admin@12345
echo.
echo   Daily use (double-click):
echo     up.bat    = start Docker + Biometric Agent
echo     down.bat  = stop everything
echo.
pause
