# ============================================================
# Run TravelOS on this PC — local database only.
#
#   .\scripts\run-local.ps1          start it
#   .\scripts\run-local.ps1 -Demo    start it and add GK sample data
#
# Then open http://localhost:3000 and sign in as
#   owner@gktravels.local / Owner@12345
#
# Safe by construction: the app is pointed at the Docker database on this
# PC (never the Neon DATABASE_URL in .env), and WhatsApp, email and the R2
# bucket are switched off for this window, so nothing can reach a real
# customer or the live files. Stop it with Ctrl+C.
# ============================================================

param([switch]$Demo)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "1/5  Checking Docker..." -ForegroundColor Cyan
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop is not running. Open it, wait until it says "Engine running", then run this again.' }

Write-Host "2/5  Starting the local database (travelos-pg on port 5434)..." -ForegroundColor Cyan
$exists = docker ps -a --filter "name=^travelos-pg$" --format "{{.Names}}"
if (-not $exists) {
  docker run -d --name travelos-pg -e POSTGRES_USER=travelos -e POSTGRES_PASSWORD=travelos -e POSTGRES_DB=travelos_test -p 5434:5432 postgres:16-alpine | Out-Null
} else {
  docker start travelos-pg | Out-Null
}
for ($i = 0; $i -lt 60; $i++) {
  docker exec travelos-pg pg_isready -U travelos *> $null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 1
}
$hasDev = docker exec travelos-pg psql -U travelos -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='travelos_dev'"
if ($hasDev -ne '1') { docker exec travelos-pg createdb -U travelos travelos_dev | Out-Null }

Write-Host "3/5  Settings for this window (local only)..." -ForegroundColor Cyan
# These win over .env (dotenv never overrides a value already set).
$env:DATABASE_URL          = 'postgresql://travelos:travelos@127.0.0.1:5434/travelos_dev'
$env:NODE_ENV              = 'development'
$env:PORT                  = '3001'
$env:FRONTEND_URL          = 'http://localhost:3000'
$env:PUBLIC_APP_URL        = 'http://localhost:3000'
$env:DEFAULT_ADMIN_EMAIL   = 'owner@gktravels.local'
$env:DEFAULT_ADMIN_PASS    = 'Owner@12345'
$env:DEFAULT_ADMIN_NAME    = 'Owner'
if (-not $env:JWT_SECRET) { $env:JWT_SECRET = 'local-only-' + [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N') }
# Nothing leaves this PC: no WhatsApp, no email, no cloud bucket.
foreach ($k in 'WHATSAPP_CLOUD_TOKEN','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_BSP_URL','SMTP_HOST','STORAGE_BUCKET','STORAGE_ACCESS_KEY_ID','STORAGE_SECRET_ACCESS_KEY') { Set-Item -Path "env:$k" -Value '' }
$env:STORAGE_LOCAL_DIR     = '.storage'
if ($env:DATABASE_URL -notmatch '127\.0\.0\.1:5434/travelos_dev$') { throw 'Refusing to start: not the local database.' }

Write-Host "4/5  Installing and updating the database..." -ForegroundColor Cyan
if (-not (Test-Path node_modules)) { npm ci }
npx prisma migrate deploy
npx prisma generate | Out-Null

if ($Demo) {
  Write-Host "     Sample data will be added in a second window once the app is up." -ForegroundColor Yellow
  Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$PWD'; node scripts/demo-data.mjs"
}

Write-Host "5/5  Starting TravelOS — open http://localhost:3000" -ForegroundColor Green
Write-Host "     Sign in: owner@gktravels.local / Owner@12345   (Ctrl+C to stop)" -ForegroundColor Green
npm run dev
