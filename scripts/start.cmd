@echo off
cd /d "%~dp0.."
echo Starting WageProof at http://localhost:4000 (Ctrl+C to stop)
call npm run start
