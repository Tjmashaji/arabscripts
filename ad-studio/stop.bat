@echo off
REM Stop the studio. Data and files are kept for next time.
cd /d "%~dp0"
docker compose down
pause
