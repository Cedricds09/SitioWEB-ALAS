<#
  watchdog-alas.ps1 — Auto-recuperación del servicio ALAS.

  Lo ejecuta la Tarea Programada 'ALAS-SelfHeal' cada 2 min y al arrancar Windows
  (ver scripts/setup-selfheal.ps1). Corre elevado y en el contexto del usuario dueño
  de PM2, así que puede reiniciar tanto 'alas' (PM2) como el servicio 'Cloudflared'.

  Cura sin intervención las 3 causas de caída conocidas (ver MANUAL-CAIDAS.md):
    A) Backend/PM2 caído        -> pm2 resurrect / restart alas
    B) Túnel Cloudflared parado -> reinicia el servicio (o lo destraba de "Stop Pending")
    C) Log de cloudflared gigante -> lo rota

  Es idempotente: si todo está sano, no toca nada. Registra cada acción en
  C:\ProgramData\alas-watchdog\watchdog.log
#>
$ErrorActionPreference = 'SilentlyContinue'

$LOCAL  = 'http://localhost:3000/api/health'
$LOGDIR = 'C:\ProgramData\alas-watchdog'
$LOG    = Join-Path $LOGDIR 'watchdog.log'
$CFLOG  = 'C:\ProgramData\cloudflared\cloudflared.log'

if (-not (Test-Path $LOGDIR)) { New-Item -ItemType Directory -Path $LOGDIR -Force | Out-Null }
function Log($m) { Add-Content -Path $LOG -Value ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) }

# Recorta el propio log si pasa de ~2 MB (deja las últimas 500 líneas).
if ((Test-Path $LOG) -and ((Get-Item $LOG).Length -gt 2MB)) {
  Set-Content -Path $LOG -Value (Get-Content $LOG -Tail 500)
}

# ---------------------------------------------------------------------------
# A) BACKEND local (PM2 / Node)
# ---------------------------------------------------------------------------
$localOk = $false
try { $h = Invoke-RestMethod -Uri $LOCAL -TimeoutSec 8; $localOk = [bool]$h.ok } catch { $localOk = $false }

if (-not $localOk) {
  Log 'BACKEND caido (local /api/health no responde ok). Remediando con PM2...'
  # Resuelve pm2 aunque el PATH no esté cargado en el contexto de la tarea.
  $pm2 = (Get-Command pm2 -ErrorAction SilentlyContinue).Source
  if (-not $pm2) {
    $cand = Join-Path $env:APPDATA 'npm\pm2.cmd'
    if (Test-Path $cand) { $pm2 = $cand }
  }
  if ($pm2) {
    & $pm2 resurrect  *> $null
    & $pm2 restart alas *> $null
  } else {
    Log 'ERROR: no se encontro el ejecutable pm2 en el contexto de la tarea.'
  }
  Start-Sleep -Seconds 8
  try { $h = Invoke-RestMethod -Uri $LOCAL -TimeoutSec 8; $localOk = [bool]$h.ok } catch {}
  Log ('BACKEND tras remediar: ' + $(if ($localOk) { 'OK' } else { 'SIGUE CAIDO (revisar manual seccion 2/3)' }))
}

# ---------------------------------------------------------------------------
# B) TÚNEL Cloudflared — sano = servicio Running y con conexiones al edge (:7844)
# ---------------------------------------------------------------------------
$svc      = Get-Service Cloudflared -ErrorAction SilentlyContinue
$tunnelOk = $false
if ($svc -and $svc.Status -eq 'Running') {
  $cf = Get-Process cloudflared -ErrorAction SilentlyContinue
  if ($cf) {
    $conns = Get-NetTCPConnection -OwningProcess $cf.Id -ErrorAction SilentlyContinue |
             Where-Object { $_.RemotePort -eq 7844 -and $_.State -eq 'Established' }
    if ($conns) { $tunnelOk = $true }
  }
}

if (-not $tunnelOk) {
  Log ('TUNEL caido (servicio=' + $(if ($svc) { $svc.Status } else { 'ausente' }) + '). Reiniciando Cloudflared...')
  try {
    Restart-Service Cloudflared -Force -ErrorAction Stop
  } catch {
    # Colgado en "Stop Pending": matar el proceso y volver a arrancar el servicio.
    $cf = Get-Process cloudflared -ErrorAction SilentlyContinue
    if ($cf) { Stop-Process -Id $cf.Id -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2 }
    Start-Service Cloudflared -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 8
  $svc2 = Get-Service Cloudflared -ErrorAction SilentlyContinue
  Log ('TUNEL tras remediar: servicio=' + $(if ($svc2) { $svc2.Status } else { 'ausente' }))
}

# ---------------------------------------------------------------------------
# C) Rotar el log de cloudflared si crece demasiado (>50 MB)
# ---------------------------------------------------------------------------
if ((Test-Path $CFLOG) -and ((Get-Item $CFLOG).Length -gt 50MB)) {
  Remove-Item "$CFLOG.1" -Force -ErrorAction SilentlyContinue
  if (Move-Item $CFLOG "$CFLOG.1" -Force -ErrorAction SilentlyContinue -PassThru) {
    Log 'cloudflared.log rotado (>50MB).'
  }
}
