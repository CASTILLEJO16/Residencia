# SIO - arranque local (Windows)
# Uso: powershell -ExecutionPolicy Bypass -File start.ps1
# Levanta backend (4000) y frontend (5173) en dos ventanas separadas.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"

function Test-PortFree($port) {
  $c = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
  return ($null -eq $c)
}

if (-not (Test-PortFree 4000)) {
  Write-Host "[start] Puerto 4000 ocupado. Ejecuta .\stop.ps1 primero o: Stop-Process -Name node -Force" -ForegroundColor Yellow
  Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue | Format-Table LocalAddress,LocalPort,State,OwningProcess -AutoSize
  exit 1
}
if (-not (Test-PortFree 5173)) {
  Write-Host "[start] Puerto 5173 ocupado. Ejecuta .\stop.ps1 primero." -ForegroundColor Yellow
  exit 1
}

# Verificar .env
if (-not (Test-Path (Join-Path $backend ".env"))) {
  Write-Host "[start] backend/.env no existe, copiando .env.example..." -ForegroundColor Yellow
  Copy-Item (Join-Path $backend ".env.example") (Join-Path $backend ".env")
  Write-Host "  -> Edita backend/.env y asegura JWT_SECRET y DB_PATH" -ForegroundColor Yellow
}

# Verificar DB
if (-not (Test-Path (Join-Path $backend "data\sio.db"))) {
  Write-Host "[start] data/sio.db no existe, creando..." -ForegroundColor Yellow
  Push-Location $backend
  node scripts/init-sqlite.js
  node scripts/seed-sqlite.js
  Pop-Location
}

Write-Host "[start] Levantando backend en http://localhost:4000 ..." -ForegroundColor Cyan
Start-Process -FilePath "powershell" -ArgumentList "-NoExit","-Command","cd '$backend'; npm run dev" -WindowStyle Normal

Start-Sleep -Seconds 2

Write-Host "[start] Levantando frontend en http://localhost:5173 ..." -ForegroundColor Cyan
Start-Process -FilePath "powershell" -ArgumentList "-NoExit","-Command","cd '$frontend'; npm run dev" -WindowStyle Normal

Write-Host ""
Write-Host "[start] Listo. Abre http://localhost:5173  (login: admin / Password123!)" -ForegroundColor Green
Write-Host "        Backend health: http://localhost:4000/api/health" -ForegroundColor Green
Write-Host "        Para detener: .\stop.ps1" -ForegroundColor Green
