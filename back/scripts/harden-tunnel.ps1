<#
  harden-tunnel.ps1 — Endurece el túnel Cloudflared contra el FLAPPING de red.
  EJECUTAR UNA SOLA VEZ como ADMINISTRADOR. Es idempotente (re-ejecutable sin daño).

  POR QUÉ (evidencia en C:\ProgramData\cloudflared\cloudflared.log):
    El servicio queda "Running" pero pierde las conexiones al edge => 1033/530 público.
      1) Corría con --protocol http2 (TCP): cuando la red casera parpadea, la conexión TCP se
         rompe y hay que re-registrar cada conexión (2-4 min de corte). QUIC (UDP) aguanta mucho
         mejor micro-cortes y cambios de IP.
      2) Casi todas las caídas eran a IPs IPv6 del edge y el resolver IPv6 fallaba. Forzamos IPv4.

  QUÉ HACE (edición PUNTUAL por regex del ImagePath; el TOKEN queda intacto, NO se reconstruye
  la línea ni se imprime el token):
    A) --protocol http2 -> --protocol quic
    B) Añade --edge-ip-version 4 / --retries 8 / --grace-period 30s  como flags del comando
       'tunnel' (ANTES de 'run'; cloudflared 2026.5.2 los rechaza si van DESPUÉS de 'run').
    C) Protege el working set del proceso (best-effort) para reducir paginación bajo presión.
    D) Refuerza las acciones de recuperación del SCM.

  SEGURIDAD: tras aplicar, VERIFICA de punta a punta contra la URL pública. Si el túnel NO
  reconecta (p.ej. UDP/7844 bloqueado por la red para QUIC), hace ROLLBACK AUTOMÁTICO a http2.

  ROLLBACK manual:  .\harden-tunnel.ps1 -Rollback

  Uso:
    1) PowerShell -> "Ejecutar como administrador"
    2) cd C:\Users\Axel\Documents\GitHub\SitioWEB-ALAS\back\scripts
    3) .\harden-tunnel.ps1            (aplicar)   |   .\harden-tunnel.ps1 -Rollback
#>
#Requires -RunAsAdministrator
[CmdletBinding()]
param([switch]$Rollback)

# 'Continue' (no 'Stop'): en PS 5.1 un nativo (sc.exe) que escribe a stderr se vuelve error
# terminante con 'Stop' y aborta el script. Las precondiciones críticas usan 'throw' explícito.
$ErrorActionPreference = 'Continue'

$SvcName = 'Cloudflared'
$Key     = 'HKLM:\SYSTEM\CurrentControlSet\Services\Cloudflared'
$PUBLIC  = 'https://alas-mantenimientointegral.com.mx/api/health'

$svc = Get-Service $SvcName -ErrorAction SilentlyContinue
if (-not $svc) { throw "No existe el servicio '$SvcName'." }

$img = (Get-ItemProperty -Path $Key -Name ImagePath -ErrorAction Stop).ImagePath
if ([string]::IsNullOrWhiteSpace($img)) { throw "ImagePath vacío; abortando." }
if ($img -notmatch '--token') { throw "El ImagePath no contiene --token; abortando por seguridad." }

# Verificación end-to-end (agnóstica al protocolo): la URL pública pasa por edge->túnel->backend.
# Si responde 200 ok:true, el túnel está sirviendo, sea http2 o quic.
function Test-Public {
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 2
    try { if ((Invoke-RestMethod -Uri $PUBLIC -TimeoutSec 6).ok) { return $true } } catch {}
  }
  return $false
}

# Aplica una transformación (apply|rollback) a la línea de ImagePath y devuelve la nueva.
function Convert-ImagePath([string]$line, [switch]$Undo) {
  $n = $line
  if ($Undo) {
    $n = $n -replace '(--protocol\s+)quic', '${1}http2'
    $n = $n -replace '\s--edge-ip-version\s+\S+', ''
    $n = $n -replace '\s--retries\s+\S+', ''
    $n = $n -replace '\s--grace-period\s+\S+', ''
    return $n
  }
  # --protocol: normaliza a quic si existe; si falta, se añadirá abajo con los de nivel 'tunnel'.
  $missing = @()
  if ($n -match '--protocol\s+\S+') { $n = $n -replace '(--protocol\s+)\S+', '${1}quic' } else { $missing += '--protocol quic' }
  # Flags de nivel 'tunnel' (van ANTES de 'run'): normalizar en sitio si existen, si no encolarlos.
  if ($n -match '--edge-ip-version\s+\S+') { $n = $n -replace '(--edge-ip-version\s+)\S+', '${1}4' }   else { $missing += '--edge-ip-version 4' }
  if ($n -match '--retries\s+\S+')          { $n = $n -replace '(--retries\s+)\S+', '${1}8' }          else { $missing += '--retries 8' }
  if ($n -match '--grace-period\s+\S+')     { $n = $n -replace '(--grace-period\s+)\S+', '${1}30s' }    else { $missing += '--grace-period 30s' }
  if ($missing.Count) {
    # Insertar todos los faltantes ENTRE 'tunnel' y 'run' (posición válida para 2026.5.2).
    # Anclamos a 'tunnel run' (el subcomando), NO a cualquier ' run', para no inyectar flags
    # dentro de la ruta del exe si esta contuviera la palabra 'run'.
    # La cadena de reemplazo no es regex; solo '$' es especial y $ins no contiene '$'.
    $ins = ($missing -join ' ')
    $n = $n -replace '(tunnel\s+)(run\b)', "`${1}$ins `${2}"
  }
  return $n
}

# ---------------------------------------------------------------------------
# Calcular el nuevo ImagePath
# ---------------------------------------------------------------------------
$orig = $img
$new  = Convert-ImagePath $img -Undo:$Rollback

$maskedNew = $new -replace '(--token[=\s]+)\S+', '${1}<REDACTED>'
if ($new -eq $orig) {
  Write-Host "ImagePath ya estaba en el estado deseado (sin cambios en la línea)." -ForegroundColor DarkGray
} else {
  $bakDir = 'C:\ProgramData\alas-watchdog'
  if (-not (Test-Path $bakDir)) { New-Item -ItemType Directory -Path $bakDir -Force | Out-Null }
  $masked = $orig -replace '(--token[=\s]+)\S+', '${1}<REDACTED>'
  Add-Content -Path (Join-Path $bakDir 'imagepath-history.log') `
    -Value ("{0}  ANTES: {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $masked)
  Set-ItemProperty -Path $Key -Name ImagePath -Value $new -ErrorAction Stop
  Write-Host ("ImagePath actualizado (token oculto): {0}" -f $maskedNew) -ForegroundColor Green
}

# Refuerza recuperación del SCM (solo al aplicar).
if (-not $Rollback) {
  sc.exe failure $SvcName reset= 86400 actions= restart/10000/restart/10000/restart/20000 | Out-Null
  sc.exe failureflag $SvcName 1 | Out-Null
}

# ---------------------------------------------------------------------------
# Reiniciar el servicio para aplicar el nuevo ImagePath
# ---------------------------------------------------------------------------
function Restart-Tunnel {
  try { Restart-Service $SvcName -Force -ErrorAction Stop }
  catch {
    $cf = Get-Process cloudflared -ErrorAction SilentlyContinue
    if ($cf) { $cf | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2 }
    try { Start-Service $SvcName -ErrorAction Stop } catch { Write-Host ("No se pudo arrancar $SvcName : " + $_.Exception.Message) -ForegroundColor Red }
  }
}
Write-Host "Reiniciando '$SvcName' para aplicar cambios (corte breve del túnel)..." -ForegroundColor Cyan
Restart-Tunnel

# Best-effort anti-paginación: solo aseguramos un working set mínimo. NO subimos la prioridad
# (podría robar CPU a SQL Server en esta máquina saturada).
Start-Sleep -Seconds 4
$cf = Get-Process cloudflared -ErrorAction SilentlyContinue | Select-Object -First 1
if ($cf) { try { $cf.MinWorkingSet = [IntPtr]::new(48MB) } catch {} }

# ---------------------------------------------------------------------------
# Verificación end-to-end + ROLLBACK AUTOMÁTICO si no reconecta
# ---------------------------------------------------------------------------
Write-Host "Verificando el sitio público (hasta ~40s)..." -ForegroundColor Cyan
$ok = Test-Public
Write-Host ""
if ($ok) {
  Write-Host ("OK - túnel sirviendo el sitio público. " + $(if ($Rollback) { '(rollback aplicado)' } else { '(quic + IPv4)' })) -ForegroundColor Green
} elseif (-not $Rollback) {
  Write-Host "ATENCION: el túnel NO reconectó tras el cambio (posible UDP/7844 bloqueado para QUIC)." -ForegroundColor Red
  Write-Host "Revirtiendo AUTOMATICAMENTE a la configuración anterior (http2)..." -ForegroundColor Yellow
  Set-ItemProperty -Path $Key -Name ImagePath -Value $orig -ErrorAction SilentlyContinue
  Restart-Tunnel
  if (Test-Public) {
    Write-Host "OK - revertido a http2 y el sitio volvió. El cambio a quic NO es viable en esta red." -ForegroundColor Green
    Write-Host "Sugerencia: prueba solo IPv4 sin quic, o revisa si el firewall bloquea UDP 7844." -ForegroundColor Yellow
  } else {
    Write-Host "CRITICO: el sitio sigue caído incluso tras revertir. Revisa el backend y el log:" -ForegroundColor Red
    Write-Host '  Get-Content C:\ProgramData\cloudflared\cloudflared.log -Tail 30'
  }
} else {
  Write-Host "ATENCION: tras el rollback el sitio no responde aún. Revisa el log:" -ForegroundColor Red
  Write-Host '  Get-Content C:\ProgramData\cloudflared\cloudflared.log -Tail 30'
}
