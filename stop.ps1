# SIO - detener procesos locales
$ports = @(4000, 5173)
foreach ($port in $ports) {
  $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    $pidKill = $c.OwningProcess
    try {
      $proc = Get-Process -Id $pidKill -ErrorAction SilentlyContinue
      if ($proc) {
        Write-Host "[stop] Matando $($proc.ProcessName) (PID $pidKill) en puerto $port" -ForegroundColor Yellow
        Stop-Process -Id $pidKill -Force -ErrorAction SilentlyContinue
      }
    } catch {}
  }
}
# Fallback: matar cualquier node restante que sea del proyecto (opcional)
# Stop-Process -Name node -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
foreach ($port in $ports) {
  $left = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
  if (-not $left) { Write-Host "[stop] Puerto $port libre" -ForegroundColor Green }
  else { Write-Host "[stop] Puerto $port sigue ocupado" -ForegroundColor Red; $left | Format-Table LocalAddress,LocalPort,State,OwningProcess -AutoSize }
}
Write-Host "[stop] Hecho." -ForegroundColor Green
