@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ========================================
echo   DESKA ERP
echo ========================================
echo.
echo Starting PostgreSQL + API + Web in Docker Desktop...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-docker.ps1"
set EXITCODE=%ERRORLEVEL%

echo.
if %EXITCODE% neq 0 (
    echo Startup failed. Common fixes:
    echo   1. Start Docker Desktop and wait until it is ready
    echo   2. Close other apps using ports 3000 / 3001 / 5433
    echo   3. Run Run.bat again
    echo.
    pause
    exit /b %EXITCODE%
)

echo DESKA ERP is running at http://localhost:3000/login
pause
exit /b 0
