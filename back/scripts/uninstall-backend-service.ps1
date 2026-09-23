<#
  uninstall-backend-service.ps1 — ROLLBACK de la migración a NSSM.
  Quita el servicio nativo 'alas' y te deja volver a PM2 si lo deseas.
  EJECUTAR como ADMINISTRADOR.
#>
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Continue'

$SvcName = 'alas'
$nssm = (Get-Command nssm -ErrorAction SilentlyContinue).Source
if (-not $nssm -and (Test-Path 'C:\ProgramData\chocolatey\bin\nssm.exe')) { $nssm = 'C:\ProgramData\chocolatey\bin\nssm.exe' }

if (Get-Service $SvcName -ErrorAction SilentlyContinue) {
  if ($nssm) {
    & $nssm stop   $SvcName confirm | Out-Null
    & $nssm remove $SvcName confirm | Out-Null
  } else {
    sc.exe stop   $SvcName | Out-Null
    sc.exe delete $SvcName | Out-Null
  }
  Write-Host "Servicio '$SvcName' eliminado." -ForegroundColor Green
} else {
  Write-Host "No existe el servicio '$SvcName' (nada que quitar)." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Para volver a PM2 (si lo necesitas):" -ForegroundColor Cyan
Write-Host "  cd C:\Users\Axel\Documents\GitHub\SitioWEB-ALAS\back"
Write-Host "  pm2 start ecosystem.config.js ; pm2 save"
