@echo off
REM Run the AI Ad Studio on Windows: double-click this file.
cd /d "%~dp0"

where docker >nul 2>nul
if errorlevel 1 (
  echo Docker is not installed. Install Docker Desktop from https://www.docker.com/products/docker-desktop and try again.
  pause
  exit /b 1
)
docker info >nul 2>nul
if errorlevel 1 (
  echo Docker is not running. Open Docker Desktop, wait until it is ready, then run this file again.
  pause
  exit /b 1
)

if not exist .env (
  powershell -NoProfile -Command "$g={param($n) -join ((1..$n) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })}; $c=@('# Generated automatically. Do not share.', ('POSTGRES_PASSWORD=' + (& $g 24)), ('STUDIO_DB_SECRET=' + (& $g 32)), ('FILE_SIGNING_SECRET=' + (& $g 32)), 'STUDIO_PORT=3000', '# true = labeled simulation for trying without keys. Set false after adding keys.', 'ALLOW_SIMULATION=true', 'ANTHROPIC_API_KEY=', 'ELEVENLABS_API_KEY=', 'RUNWAY_API_KEY='); [IO.File]::WriteAllLines((Join-Path (Get-Location) '.env'), $c)"
  echo Created .env
)

echo Building and starting. The first run takes 5 to 10 minutes...
docker compose up -d --build
if errorlevel 1 (
  echo Start failed. See the messages above.
  pause
  exit /b 1
)

set PORT=3000
for /f "tokens=2 delims==" %%p in ('findstr /b "STUDIO_PORT=" .env') do set PORT=%%p

powershell -NoProfile -Command "$u='http://localhost:%PORT%'; for($i=0;$i -lt 180;$i++){ try { Invoke-WebRequest -UseBasicParsing \"$u/api/health\" -TimeoutSec 3 | Out-Null; Write-Host \"Ready: $u\"; Start-Process $u; exit 0 } catch { Start-Sleep 2 } }; Write-Host 'Not ready yet. Show logs with: docker compose logs app'; exit 1"
pause
