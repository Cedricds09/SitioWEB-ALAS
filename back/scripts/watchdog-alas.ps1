<#
  watchdog-alas.ps1 — Auto-recuperación del servicio ALAS.

  Lo ejecuta la Tarea Programada 'ALAS-SelfHeal' cada 1 min y al arrancar Windows
  (ver scripts/setup-selfheal.ps1). Corre elevado y en el contexto del usuario dueño
  de PM2, así que puede reiniciar 'alas' (PM2), el servicio 'Cloudflared' y SQL Server.

  Cura sin intervención (ver MANUAL-CAIDAS.md secciones 2/3/5.2/9):
    A) Backend Node muerto        -> pm2 restart/resurrect (según jlist)
    B) DB caída (health db!=ok)   -> arranca MSSQLSERVER si está parado (NO reinicia alas)
    C) Túnel Cloudflared parado   -> reinicia el servicio (o lo destraba de "Stop Pending")
    D) Log de cloudflared enorme  -> rotación real (>150MB, reinicia el túnel un instante)
    E) RAM baja                   -> registra top consumidores (diagnóstico; NO mata apps)
    F) Blindaje anti-paginación   -> mantiene prioridad AboveNormal + MinWorkingSet de
                                     node(alas) y cloudflared en cada pasada (un reinicio de
                                     servicio los resetea; esto los vuelve a fijar solo).

  Robustez:
    - Fija PM2_HOME para hablar SIEMPRE con el daemon correcto (evita daemons huérfanos).
    - Histéresis: exige 2 fallos consecutivos antes de reiniciar backend o túnel, para no
      cortar usuarios por un pico transitorio.
    - Idempotente: si todo está sano, no toca nada.
    - Registra cada acción en C:\ProgramData\alas-watchdog\watchdog.log

  NOTA DE INTERVALO: la tarea corre cada 1 min (setup-selfheal.ps1) para cerrar la ventana de
  recuperación del túnel que flapea. Con histéresis de 2 fallos, actúa a los ~2 min de un fallo real.
#>
$ErrorActionPreference = 'Continue'

# CRÍTICO: sin esto, una tarea S4U (sesión no interactiva) puede arrancar OTRO daemon PM2
# con su propio pipe y reproducir el lío de daemons huérfanos / EPERM que este script cura.
$env:PM2_HOME = 'C:\Users\Axel\.pm2'

$LOCAL   = 'http://localhost:3000/api/health'
$PUBLIC  = 'https://alas-mantenimientointegral.com.mx/api/health'   # señal end-to-end del túnel
$SVC_ALAS = 'alas'                             # servicio nativo (NSSM); si no existe, usa PM2
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

# Blindaje anti-paginación best-effort: asegura un working set mínimo del proceso para reducir que
# Windows lo pagine a disco bajo presión de RAM del escritorio (Chrome/Spotify/Defender...).
# NO sube la prioridad (subir node+cloudflared por encima de SQL podría robarle CPU al SQL que ya
# sufre paginación). Silencioso e idempotente.
function Protect-Process($name, $minWs) {
  Get-Process $name -ErrorAction SilentlyContinue | ForEach-Object {
    try { if ([int64]$_.MinWorkingSet -lt $minWs) { $_.MinWorkingSet = [IntPtr]::new($minWs) } } catch {}
  }
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
    $svcAlas = Get-Service $SVC_ALAS -ErrorAction SilentlyContinue
    if ($svcAlas) {
      # Arquitectura nueva: backend como servicio nativo (NSSM). Sin PM2, sin pipes.
      Log 'BACKEND caido confirmado x2. Reiniciando servicio nativo alas...'
      try { Restart-Service $SVC_ALAS -Force -ErrorAction Stop }
      catch { try { Start-Service $SVC_ALAS -ErrorAction Stop } catch { Log ('No se pudo arrancar el servicio alas: ' + $_.Exception.Message) } }
    } else {
      # Respaldo (setup viejo aún en PM2, antes de migrar a servicio).
      Log 'BACKEND caido confirmado x2. Remediando con PM2 (servicio alas no existe)...'
      $pm2 = Get-Pm2Path
      if ($pm2) {
        $alas = $null
        try { $alas = (& $pm2 jlist 2>$null | ConvertFrom-Json) | Where-Object { $_.name -eq 'alas' } } catch {}
        if ($alas) { & $pm2 restart alas *> $null } else { & $pm2 resurrect *> $null }
      } else { Log 'ERROR: no hay servicio alas ni pm2 en el contexto de la tarea.' }
    }
    Start-Sleep -Seconds 8
    try { Invoke-WebRequest -Uri $LOCAL -TimeoutSec 8 -UseBasicParsing | Out-Null; Log 'BACKEND tras remediar: OK' }
    catch { Log 'BACKEND tras remediar: SIGUE CAIDO (revisar manual seccion 2/3)' }
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
# C) TÚNEL Cloudflared — salud AGNÓSTICA AL PROTOCOLO.
#    No usamos conexiones TCP :7844 como señal: con QUIC (UDP) daría falso negativo y
#    reiniciaría el túnel en bucle. En su lugar medimos de punta a punta con la URL pública
#    (edge -> túnel -> backend). Solo es concluyente si el backend local está sano; si el
#    backend está mal, un fallo público es culpa del backend (esa rama ya lo remedia), no del túnel.
# ---------------------------------------------------------------------------
$svc          = Get-Service Cloudflared -ErrorAction SilentlyContinue
$localHealthy = ($nodeUp -and $dbOk)
$tunnelOk     = $true                     # por defecto: no tocar
if (-not $svc -or $svc.Status -ne 'Running') {
  $tunnelOk = $false                      # servicio caído/ausente => definitivamente mal
} elseif ($localHealthy) {
  $tunnelOk = $false
  try { if ((Invoke-RestMethod -Uri $PUBLIC -TimeoutSec 10).ok) { $tunnelOk = $true } } catch {}
}
# (si el servicio corre pero el backend NO está sano, dejamos $tunnelOk=true para no reiniciar
#  el túnel por culpa del backend; la sección A/B ya está remediando el backend.)

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

# ---------------------------------------------------------------------------
# E) BLINDAJE ANTI-PAGINACION de los procesos criticos (cada pasada, idempotente).
#    Un reinicio del servicio (alas o Cloudflared) resetea prioridad/working set a lo normal,
#    asi que aqui los volvemos a fijar. node = backend alas; cloudflared = tunel.
# ---------------------------------------------------------------------------
Protect-Process 'node'        (64MB)
Protect-Process 'cloudflared' (48MB)

# ---------------------------------------------------------------------------
# F) MONITOREO DE RAM. No matamos apps del usuario (es su escritorio), pero si la RAM libre
#    cae por debajo del umbral registramos los mayores consumidores para diagnostico posterior
#    (evidencia de que la presion de memoria vino del escritorio, no de ALAS).
#    Umbral: 600 MB libres. Se loguea a lo sumo una vez cada 30 min para no inflar el log.
# ---------------------------------------------------------------------------
$RAM_FLAG   = Join-Path $LOGDIR 'ram.lastlog'
$RAM_UMBRAL = 600      # MB libres
try {
  $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
  $freeMB  = [int]($os.FreePhysicalMemory / 1024)
  $totalMB = [int]($os.TotalVisibleMemorySize / 1024)
  if ($freeMB -lt $RAM_UMBRAL) {
    $recent = $false
    if (Test-Path $RAM_FLAG) {
      $last = (Get-Item $RAM_FLAG).LastWriteTime
      if ((Get-Date) - $last -lt (New-TimeSpan -Minutes 30)) { $recent = $true }
    }
    if (-not $recent) {
      $top = Get-Process -ErrorAction SilentlyContinue |
             Group-Object -Property ProcessName |
             ForEach-Object { [PSCustomObject]@{ Name = $_.Name; MB = [int](($_.Group | Measure-Object WorkingSet64 -Sum).Sum / 1MB) } } |
             Sort-Object MB -Descending | Select-Object -First 6
      $resumen = ($top | ForEach-Object { "{0}={1}MB" -f $_.Name, $_.MB }) -join ', '
      Log ("RAM BAJA: libre={0}MB de {1}MB (umbral {2}MB). Top: {3}" -f $freeMB, $totalMB, $RAM_UMBRAL, $resumen)
      # Marca de estado sano de SQL: si la DB reporto error, cruzar con RAM ayuda al diagnostico.
      if (-not $dbOk) { Log 'RAM baja + DB con error: probable paginacion de SQL Server (ver manual 3.3).' }
      Set-Content -Path $RAM_FLAG -Value (Get-Date -Format 's')
    }
  }
} catch { Log ('No se pudo leer la RAM: ' + $_.Exception.Message) }
