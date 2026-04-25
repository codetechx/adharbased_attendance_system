@echo off
title AMS Biometric Agent (WBF)
echo.
echo =====================================================
echo  AMS Biometric Agent - Windows Biometric Framework
echo =====================================================
echo.

:: Check Python
where py >nul 2>&1
if errorlevel 1 (
    where python >nul 2>&1
    if errorlevel 1 (
        echo ERROR: Python not found in PATH.
        echo Install Python 3.10+ from https://python.org
        pause
        exit /b 1
    )
    set PYTHON=python
) else (
    set PYTHON=py -3
)

:: Install dependencies if needed
echo Checking dependencies...
%PYTHON% -c "import websockets" >nul 2>&1
if errorlevel 1 (
    echo Installing websockets...
    %PYTHON% -m pip install websockets
)

cd /d "%~dp0"
echo Starting WBF biometric agent on ws://localhost:12345 ...
echo.
%PYTHON% winbio_server.py
pause
