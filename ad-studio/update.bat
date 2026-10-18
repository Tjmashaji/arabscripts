@echo off
REM Update the studio to the latest version. Your .env, accounts, projects and files are kept.
cd /d "%~dp0"
if not exist .env (
  echo .env not found. Run this file from your existing ad-studio folder.
  pause
  exit /b 1
)
docker compose down
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Copy-Item .env .env.backup -Force; $z=Join-Path $env:TEMP 'ad-studio-update.zip'; $t=Join-Path $env:TEMP 'ad-studio-update'; Write-Host 'Downloading...'; Invoke-WebRequest -UseBasicParsing 'https://github.com/tjmashaji/arabscripts/archive/refs/heads/claude/busy-maxwell-qdsk7y.zip' -OutFile $z; if (Test-Path $t) { Remove-Item $t -Recurse -Force }; Expand-Archive $z $t; $src=Join-Path (Get-ChildItem $t -Directory | Select-Object -First 1).FullName 'ad-studio'; Get-ChildItem $src -Force | Where-Object Name -ne 'update.bat' | Copy-Item -Destination . -Recurse -Force; Copy-Item .env.backup .env -Force; Remove-Item $z,$t -Recurse -Force; Write-Host 'Updated.'"
if errorlevel 1 (
  echo Update failed. Your .env is unchanged.
  pause
  exit /b 1
)
call start.bat
docker image prune -f >nul 2>nul
