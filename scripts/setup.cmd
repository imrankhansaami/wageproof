@echo off
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.5 or later is required. Install it from https://nodejs.org and run this again.
  pause
  exit /b 1
)
echo Installing dependencies...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo npm install failed.
  pause
  exit /b 1
)
echo Seeding the demo database...
call npm run seed
echo.
echo Setup complete. Start the app with scripts\start.cmd
pause
