<#
  install-backend-service.ps1 — Migra el backend ALAS de PM2 a un SERVICIO NATIVO de Windows (NSSM).
  EJECUTAR UNA SOLA VEZ como ADMINISTRADOR.

  Por qué: PM2 en Windows (contextos elevado/no-elevado, pipes, daemons huérfanos) fue causa de caída.
  Un servicio nativo arranca en el boot sin login, lo gestiona el SCM, se reinicia solo si el proceso
  muere, y elimina TODO el problema de PM2. El watchdog (watchdog-alas.ps1) detecta el servicio 'alas'
  y lo gestiona con Restart-Service (sin PM2_HOME ni pipes).

  Es idempotente (si el servicio existe, lo reconfigura). Rollback: uninstall-backend-service.ps1.

  AVISO: durante el cambio hay ~10-20s de corte del backend (se baja PM2 y arranca el servicio).

  Uso:
    1) PowerShell -> "Ejecutar como administrador"
    2) cd C:\Users\Axel\Documents\GitHub\SitioWEB-ALAS\back\scripts
    3) .\install-backend-service.ps1
#>
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

$SvcName = 'alas'
$Back    = 'C:\Users\Axel\Documents\GitHub\SitioWEB-ALAS\back'
$Node    = 'C:\Program Files\nodejs\node.exe'
$Script  = 'src\server.js'
$LogDir  = 'C:\ProgramData\alas'
$Health  = 'http://localhost:3000/api/health'

if (-not (Test-Path $Node)) { throw "No existe node.exe en $Node" }
if (-not (Test-Path (Join-Path $Back $Script))) { throw "No existe $Script en $Back" }
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

# --- 1) Asegurar NSSM (choco preferente; winget de respaldo) ---
function Resolve-Nssm {
  $c = (Get-Command nssm -ErrorAction SilentlyContinue).Source
  if ($c) { return $c }
  if (Test-Path 'C:\ProgramData\chocolatey\bin\nssm.exe') { return 'C:\ProgramData\chocolatey\bin\nssm.exe' }
  return $null
}
$nssm = Resolve-Nssm
if (-not $nssm) {
  Write-Host "NSSM no está instalado. Instalando..." -ForegroundColor Cyan
  if (Get-Command choco -ErrorAction SilentlyContinue) {
    choco install nssm -y --no-progress | Out-Null
  } elseif (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install --id NSSM.NSSM -e --accept-source-agreements --accept-package-agreements | Out-Null
  } else {
    throw "No hay choco ni winget. Instala NSSM desde https://nssm.cc y reintenta."
  }
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
  $nssm = Resolve-Nssm
  if (-not $nssm) { throw "NSSM se instaló pero no se localiza el ejecutable." }
}
Write-Host "NSSM: $nssm" -ForegroundColor Green

# --- 2) Bajar PM2 para liberar el 3000 y que no resucite 'alas' ---
$env:PM2_HOME = 'C:\Users\Axel\.pm2'
$pm2 = (Get-Command pm2 -ErrorAction SilentlyContinue).Source
if (-not $pm2) { $cand = Join-Path $env:APPDATA 'npm\pm2.cmd'; if (Test-Path $cand) { $pm2 = $cand } }
if ($pm2) {
  Write-Host "Retirando 'alas' de PM2 y deteniendo el daemon..." -ForegroundColor Cyan
  & $pm2 delete alas   2>$null | Out-Null
  & $pm2 save --force   2>$null | Out-Null
  & $pm2 kill           2>$null | Out-Null
}
# Matar cualquier node suelto que aún ocupe el 3000 (p.ej. parche viejo).
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

# --- 3) Crear/reconfigurar el servicio ---
if (Get-Service $SvcName -ErrorAction SilentlyContinue) {
  Write-Host "El servicio '$SvcName' ya existe; reconfigurando..." -ForegroundColor Yellow
  & $nssm stop $SvcName confirm | Out-Null
} else {
  & $nssm install $SvcName $Node $Script | Out-Null
}
& $nssm set $SvcName AppDirectory        $Back                            | Out-Null
& $nssm set $SvcName AppParameters       $Script                          | Out-Null
& $nssm set $SvcName AppEnvironmentExtra "NODE_ENV=production" "PORT=3000" | Out-Null
& $nssm set $SvcName DisplayName         "ALAS Backend (Node)"            | Out-Null
& $nssm set $SvcName Description          "Backend Express de ALAS (servicio nativo, migrado de PM2)." | Out-Null
& $nssm set $SvcName Start               SERVICE_AUTO_START               | Out-Null
# Logs con rotación nativa de NSSM (evita el problema del log gigante).
& $nssm set $SvcName AppStdout           (Join-Path $LogDir 'alas-out.log') | Out-Null
& $nssm set $SvcName AppStderr           (Join-Path $LogDir 'alas-err.log') | Out-Null
& $nssm set $SvcName AppRotateFiles      1        | Out-Null
& $nssm set $SvcName AppRotateOnline     1        | Out-Null
& $nssm set $SvcName AppRotateBytes      10485760 | Out-Null
# Auto-reinicio si el proceso muere, con throttle para no entrar en bucle agresivo.
& $nssm set $SvcName AppExit Default     Restart  | Out-Null
& $nssm set $SvcName AppRestartDelay     3000     | Out-Null
& $nssm set $SvcName AppThrottle         5000     | Out-Null

# --- 4) Arrancar y verificar salud ---
& $nssm start $SvcName | Out-Null
Write-Host "Esperando /api/health..." -ForegroundColor Cyan
$ok = $false
for ($i = 0; $i -lt 12; $i++) {
  Start-Sleep -Seconds 2
  try { if ((Invoke-RestMethod -Uri $Health -TimeoutSec 5).ok) { $ok = $true; break } } catch {}
}
Write-Host ""
if ($ok) {
  Write-Host "OK - servicio '$SvcName' ARRIBA y /api/health responde ok:true. PM2 retirado." -ForegroundColor Green
  Write-Host "Gestion:  Get-Service $SvcName ; Restart-Service $SvcName ; logs en $LogDir"
  Write-Host "Rollback: .\uninstall-backend-service.ps1"
} else {
  Write-Host "ATENCION: el servicio no respondio health en ~24s. Revisa el log de error:" -ForegroundColor Red
  Get-Content (Join-Path $LogDir 'alas-err.log') -Tail 25 -ErrorAction SilentlyContinue
  Write-Host "Rollback disponible: .\uninstall-backend-service.ps1" -ForegroundColor Yellow
}
