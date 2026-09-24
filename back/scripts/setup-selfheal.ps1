<#
  setup-selfheal.ps1 — Activa la AUTO-RECUPERACIÓN de ALAS. EJECUTAR UNA SOLA VEZ como ADMINISTRADOR.

  Deja registrada la Tarea Programada 'ALAS-SelfHeal' que corre scripts/watchdog-alas.ps1:
    - cada 1 minuto (antes 2; se bajó para cerrar la ventana de recuperación del túnel que
      flapea; con MultipleInstances=IgnoreNew una pasada nunca pisa a otra), y
    - al arrancar Windows (cubre reinicios de la máquina).

  La tarea corre con LogonType S4U (sin guardar contraseña, funciona aunque no haya sesión
  iniciada) y con privilegios elevados, en el contexto de TU usuario — así el watchdog puede
  gestionar tanto 'alas' (PM2, mismo pm2_home) como el servicio 'Cloudflared'.

  Tras ejecutarlo una vez, NO tienes que volver a tocar PowerShell: el sistema se cura solo.

  Uso:
    1) Click derecho en PowerShell -> "Ejecutar como administrador"
    2) cd C:\Users\Axel\Documents\GitHub\SitioWEB-ALAS\back\scripts
    3) .\setup-selfheal.ps1
#>
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

$taskName = 'ALAS-SelfHeal'
$script   = Join-Path $PSScriptRoot 'watchdog-alas.ps1'
if (-not (Test-Path $script)) { throw "No se encuentra watchdog-alas.ps1 junto a este script ($script)" }

$user = "$env:USERDOMAIN\$env:USERNAME"

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $script)

# Dispara al arrancar Windows (con 90s de retardo para no competir con SQL/Cloudflared/PM2
# en el arranque) + repite cada 1 min de forma indefinida.
$trigStart  = New-ScheduledTaskTrigger -AtStartup
$trigStart.Delay = 'PT90S'
$trigRepeat = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)

$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType S4U -RunLevel Highest

# ExecutionTimeLimit 3 min: el watchdog nunca tarda tanto (a lo sumo ~16s de sleeps); si por lo
# que sea se colgara, el SCM lo mata antes del siguiente disparo. IgnoreNew evita solapes.
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 3)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($trigStart, $trigRepeat) `
  -Principal $principal -Settings $settings `
  -Description 'Auto-recuperacion ALAS: backend + tunel Cloudflared + RAM (watchdog cada 1 min)' -Force | Out-Null

# Refuerza las acciones de recuperacion del servicio Cloudflared (por si el proceso crashea).
sc.exe failure Cloudflared reset= 86400 actions= restart/20000/restart/20000/restart/30000 | Out-Null
sc.exe failureflag Cloudflared 1 | Out-Null

# Prevencion del log gigante EN ORIGEN: baja --loglevel de info a warn.
# Edicion puntual del ImagePath en el registro (NO reconstruye la linea: solo cambia la palabra
# tras --loglevel), asi el token del tunel queda intacto. Aplica al reiniciar el servicio.
try {
  $key = 'HKLM:\SYSTEM\CurrentControlSet\Services\Cloudflared'
  $img = (Get-ItemProperty -Path $key -Name ImagePath -ErrorAction Stop).ImagePath
  if ($img -match '--loglevel\s+info') {
    $new = $img -replace '(--loglevel\s+)info', '$1warn'
    Set-ItemProperty -Path $key -Name ImagePath -Value $new
    Write-Host "Cloudflared --loglevel -> warn (aplica al proximo reinicio del servicio)." -ForegroundColor Green
  } else {
    Write-Host "Cloudflared --loglevel ya no es 'info' (sin cambios)." -ForegroundColor DarkGray
  }
} catch {
  Write-Host "Aviso: no se pudo ajustar el loglevel de Cloudflared: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "OK - Tarea '$taskName' registrada (cada 1 min + al arranque de Windows)." -ForegroundColor Green
Write-Host "El watchdog ya vigila backend y tunel. Comprobar con:" -ForegroundColor Green
Write-Host "  Get-ScheduledTask $taskName | Select-Object TaskName,State"
Write-Host "  Get-Content C:\ProgramData\alas-watchdog\watchdog.log -Tail 20"
Write-Host ""
Write-Host "Ejecutando una pasada del watchdog ahora para dejar todo verde..." -ForegroundColor Cyan
Start-ScheduledTask -TaskName $taskName
