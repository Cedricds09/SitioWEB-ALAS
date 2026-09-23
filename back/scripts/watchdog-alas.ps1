<#
  watchdog-alas.ps1 — Auto-recuperación del servicio ALAS.

  Lo ejecuta la Tarea Programada 'ALAS-SelfHeal' cada 2 min y al arrancar Windows
  (ver scripts/setup-selfheal.ps1). Corre elevado y en el contexto del usuario dueño
  de PM2, así que puede reiniciar 'alas' (PM2), el servicio 'Cloudflared' y SQL Server.

  Cura sin intervención (ver MANUAL-CAIDAS.md secciones 2/3/5.2/9):
    A) Backend Node muerto        -> pm2 restart/resurrect (según jlist)
    B) DB caída (health db!=ok)   -> arranca MSSQLSERVER si está parado (NO reinicia alas)
    C) Túnel Cloudflared parado   -> reinicia el servicio (o lo destraba de "Stop Pending")
    D) Log de cloudflared enorme  -> rotación real (>150MB, reinicia el túnel un instante)

  Robustez:
    - Fija PM2_HOME para hablar SIEMPRE con el daemon correcto (evita daemons huérfanos).
    - Histéresis: exige 2 fallos consecutivos antes de reiniciar backend o túnel, para no
      cortar usuarios por un pico transitorio.
    - Idempotente: si todo está sano, no toca nada.
    - Registra cada acción en C:\ProgramData\alas-watchdog\watchdog.log
#>
$ErrorActionPreference = 'Continue'

# CRÍTICO: sin esto, una tarea S4U (sesión no interactiva) puede arrancar OTRO daemon PM2
# con su propio pipe y reproducir el lío de daemons huérfanos / EPERM que este script cura.
$env:PM2_HOME = 'C:\Users\Axel\.pm2'

$LOCAL   = 'http://localhost:3000/api/health'
$LOGDIR  = 'C:\ProgramData\alas-watchdog'
$LOG     = Join-Path $LOGDIR 'watchdog.log'
$CFLOG   = 'C:\ProgramData\cloudflared\cloudflared.log'
$BK_FLAG = Join-Path $LOGDIR 'backend.fail'   # marca de 1er fallo (histéresis)
$TN_FLAG = Join-Path $LOGDIR 'tunnel.fail'

if (-not (Test-Path $LOGDIR)) { New-Item -ItemType Directory -Path $LOGDIR -Force | Out-Null }
function Log($m) { Add-Content -Path $LOG -Value ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) }

# Recorta el propio log si pasa de ~2 MB.
if ((Test-Path $LOG) -and ((Get-Item $LOG).Length -gt 2MB)) {
  Set-Content -Path $LOG -Value (Get-Content $LOG -Tail 500)
}

function Get-Pm2Path {
  $c = (Get-Command pm2 -ErrorAction SilentlyContinue).Source
  if (-not $c) { $cand = Join-Path $env:APPDATA 'npm\pm2.cmd'; if (Test-Path $cand) { $c = $cand } }
  return $c
}

# ---------------------------------------------------------------------------
# A/B) BACKEND — distinguir "Node muerto" de "Node vivo pero DB caída".
#      /api/health devuelve 200 sano; 500 con cuerpo {db:"error"} si falla la DB.
#      En PS 5.1 un 500 lanza excepción: el cuerpo viene en $_.ErrorDetails.Message.
# ---------------------------------------------------------------------------
$body = $null; $responded = $false
try {
  $r = Invoke-WebRequest -Uri $LOCAL -TimeoutSec 8 -UseBasicParsing
  $body = $r.Content | ConvertFrom-Json; $responded = $true
} catch {
  if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
    try { $body = $_.ErrorDetails.Message | ConvertFrom-Json; $responded = $true } catch {}
  }
}
$nodeUp = $responded                                   # respondió algo => proceso Node vivo
$dbOk   = ($responded -and $body.db -eq 'ok')

if (-not $nodeUp) {
  # Node no responde (proceso caído). Histéresis: actuar solo al 2º fallo consecutivo.
  if (Test-Path $BK_FLAG) {
    Remove-Item $BK_FLAG -Force -ErrorAction SilentlyContinue
    Log 'BACKEND caido (Node no responde) confirmado x2. Remediando con PM2...'
    $pm2 = Get-Pm2Path
    if ($pm2) {
      $alas = $null
      try { $alas = (& $pm2 jlist 2>$null | ConvertFrom-Json) | Where-Object { $_.name -eq 'alas' } } catch {}
      if ($alas) { & $pm2 restart alas *> $null } else { & $pm2 resurrect *> $null }
      Start-Sleep -Seconds 8
      try { Invoke-WebRequest -Uri $LOCAL -TimeoutSec 8 -UseBasicParsing | Out-Null; Log 'BACKEND tras remediar: OK' }
      catch { Log 'BACKEND tras remediar: SIGUE CAIDO (revisar manual seccion 2/3)' }
    } else { Log 'ERROR: no se encontro pm2 en el contexto de la tarea.' }
  } else {
    New-Item $BK_FLAG -Force | Out-Null
    Log 'BACKEND fallo 1/2 (Node no responde). Espero confirmacion.'
  }
}
elseif (-not $dbOk) {
  # Node vivo pero DB caída => el problema es SQL, NO reiniciar alas (evita bucle inútil).
  Remove-Item $BK_FLAG -Force -ErrorAction SilentlyContinue
  $sql = Get-Service MSSQLSERVER -ErrorAction SilentlyContinue
  if ($sql -and $sql.Status -ne 'Running') {
    Log ('DB caida y MSSQLSERVER=' + $sql.Status + '. Arrancando SQL Server...')
    try { Start-Service MSSQLSERVER -ErrorAction Stop; Log 'MSSQLSERVER arrancado.' }
    catch { Log ('No se pudo arrancar MSSQLSERVER: ' + $_.Exception.Message) }
  } else {
    Log 'DB reporta error con MSSQLSERVER Running (posible RAM/paginacion, ver manual 3.3). No reinicio alas.'
  }
}
else {
  Remove-Item $BK_FLAG -Force -ErrorAction SilentlyContinue   # todo sano
}

# ---------------------------------------------------------------------------
# C) TÚNEL Cloudflared — sano = servicio Running y con conexiones al edge (:7844)
# ---------------------------------------------------------------------------
$svc      = Get-Service Cloudflared -ErrorAction SilentlyContinue
$tunnelOk = $false
if ($svc -and $svc.Status -eq 'Running') {
  $cf = Get-Process cloudflared -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($cf) {
    $conns = Get-NetTCPConnection -OwningProcess $cf.Id -ErrorAction SilentlyContinue |
             Where-Object { $_.RemotePort -eq 7844 -and $_.State -eq 'Established' }
    if ($conns) { $tunnelOk = $true }
  }
}

if (-not $tunnelOk) {
  # Histéresis: no reiniciar el túnel (corta usuarios en vivo) por un blip; exigir 2 fallos.
  if (Test-Path $TN_FLAG) {
    Remove-Item $TN_FLAG -Force -ErrorAction SilentlyContinue
    Log ('TUNEL caido confirmado x2 (servicio=' + $(if ($svc) { $svc.Status } else { 'ausente' }) + '). Reiniciando Cloudflared...')
    try {
      Restart-Service Cloudflared -Force -ErrorAction Stop
    } catch {
      # Colgado en "Stop Pending": matar el proceso y volver a arrancar el servicio.
      $cf = Get-Process cloudflared -ErrorAction SilentlyContinue
      if ($cf) { $cf | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2 }
      try { Start-Service Cloudflared -ErrorAction Stop } catch { Log ('No se pudo arrancar Cloudflared: ' + $_.Exception.Message) }
    }
    Start-Sleep -Seconds 8
    $svc2 = Get-Service Cloudflared -ErrorAction SilentlyContinue
    Log ('TUNEL tras remediar: servicio=' + $(if ($svc2) { $svc2.Status } else { 'ausente' }))
  } else {
    New-Item $TN_FLAG -Force | Out-Null
    Log 'TUNEL fallo 1/2. Espero confirmacion.'
  }
} else {
  Remove-Item $TN_FLAG -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# D) Rotación REAL del log de cloudflared (último recurso). La prevención principal
#    es --loglevel warn, que aplica setup-selfheal.ps1. El servicio mantiene el
#    handle abierto, así que la única rotación fiable es soltar el archivo reiniciando
#    el servicio; solo se hace si el log es enorme (>150MB) para no cortar el túnel seguido.
# ---------------------------------------------------------------------------
if ((Test-Path $CFLOG) -and ((Get-Item $CFLOG).Length -gt 150MB)) {
  Log 'cloudflared.log >150MB. Rotando (reinicia el tunel un instante)...'
  try {
    Stop-Service Cloudflared -Force -ErrorAction Stop
    Start-Sleep -Seconds 2
    Remove-Item "$CFLOG.1" -Force -ErrorAction SilentlyContinue
    Move-Item $CFLOG "$CFLOG.1" -Force -ErrorAction Stop
    Start-Service Cloudflared -ErrorAction Stop
    Log 'cloudflared.log rotado y servicio reiniciado.'
  } catch { Log ('Fallo la rotacion del log: ' + $_.Exception.Message) }
}
