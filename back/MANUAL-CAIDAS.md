# Manual de recuperación — Servicio ALAS

Guía para diagnosticar y levantar el sitio **sin ayuda externa** cuando "se cae".
Escrito el 2026-09-13 tras una caída real. Léelo de arriba hacia abajo.

---

## 0. Cómo está montado el servicio (para entender qué puede fallar)

| Pieza | Qué es | Dónde vive |
|---|---|---|
| **Backend Node** | API Express que sirve el sitio | `back/src/server.js`, arrancado por **PM2** con nombre `alas` |
| **PM2** | Gestor que mantiene Node vivo y lo reinicia | proceso `alas`, se resucita al iniciar sesión de Windows |
| **SQL Server** | Base de datos `ALAS` | servicio Windows `MSSQLSERVER`, puerto **1433** |
| **Cloudflare Tunnel** | Expone el sitio a internet con HTTPS | dominio `alas-mantenimientointegral.com.mx` |
| **Anthropic API** | IA de presupuestos | key en `back/.env` (`ANTHROPIC_API_KEY`) |

El backend depende de **tres cosas externas**: SQL Server (1433), internet/Cloudflare, y la API de Anthropic.
Si una falla, se cae una parte (o todo) del sitio.

---

## 1. Diagnóstico rápido (2 minutos)

Abre **PowerShell** y ejecuta en orden. Cada comando te dice qué está roto.

```powershell
# 1) ¿El backend responde y ve la base de datos?
Invoke-RestMethod -Uri "http://localhost:3000/api/health" | ConvertTo-Json
```
- `"ok": true, "db": "ok"`  → backend y base **sanos**. El problema es la red/Cloudflare (ve la sección 5).
- `"db": "error"`            → **la base de datos está caída** (ve la sección 3). **← causa más común.**
- **No responde nada / error de conexión** → el backend está caído (ve la sección 2).

```powershell
# 2) ¿PM2 tiene vivo el proceso 'alas'?
pm2 status
```
- `status: online` → Node corriendo.
- `stopped` / `errored` → ve la sección 2.

```powershell
# 3) ¿Los últimos errores del backend?
pm2 logs alas --lines 40 --nostream --err
```
Busca la pista:
- `Failed to connect to localhost:1433` → **base de datos** (sección 3).
- `status=401 ... invalid x-api-key` → **API key de Anthropic** (sección 4).
- `CORS bloqueado: ...` → normal/ruido, **no** es la causa de la caída (sección 6).

---

## 2. El backend (Node/PM2) está caído

```powershell
# Reinícialo
pm2 restart alas

# Si no existe el proceso, arráncalo desde cero:
cd C:\Users\Axel\Documents\GitHub\SitioWEB-ALAS\back
pm2 start ecosystem.config.js
pm2 save

# Verifica
pm2 status
Invoke-RestMethod -Uri "http://localhost:3000/api/health" | ConvertTo-Json
```

Si al arrancar se cierra solo, mira el error exacto:
```powershell
pm2 logs alas --lines 60 --nostream
```
Causas típicas: falta una variable en `back\.env` (el arranque aborta a propósito si falta algo crítico),
o el puerto 3000 ocupado (`Get-NetTCPConnection -LocalPort 3000`).

---

## 3. La base de datos no conecta (`Failed to connect to localhost:1433`)  ← CAÍDA REAL DEL 12/09

Esta fue **la causa de la última caída**. Sigue estos pasos.

### 3.1 ¿El servicio de SQL Server está corriendo?
```powershell
Get-Service MSSQLSERVER
```
- `Stopped` → arráncalo:
  ```powershell
  Start-Service MSSQLSERVER
  ```
- `Running` pero igual falla → sigue en 3.2.

### 3.2 ¿El puerto 1433 acepta conexiones?
```powershell
Test-NetConnection -ComputerName localhost -Port 1433
```
- `TcpTestSucceeded: True` → el puerto está bien; el problema es memoria (3.3) o credenciales (3.4).
- `False` → SQL no está escuchando: reinícialo con `Restart-Service MSSQLSERVER` y repite.

### 3.3 ⭐ CAUSA RAÍZ: SQL Server se come toda la RAM y Windows lo pagina a disco

La máquina tiene **~7.8 GB de RAM**. Por defecto SQL Server intenta usar **memoria ilimitada**,
Windows lo empieza a paginar a disco (eventos *"A significant part of SQL Server process memory has been paged out"*)
y las conexiones al 1433 empiezan a fallar de forma intermitente hasta caer del todo.

**Verifica el límite de memoria de SQL Server:**
```powershell
Invoke-SqlCmd -ServerInstance "localhost" -Username "sa" -Password ")it8UmtqKxrW4@X7h+3NhSUB" `
  -Query "SELECT value_in_use FROM sys.configurations WHERE name='max server memory (MB)'"
```
- Si sale **2147483647** (o un número enorme) → **está sin límite: ESE ES EL PROBLEMA.**

**Arréglalo (déjalo en 2048 MB = 2 GB):**
```powershell
Invoke-SqlCmd -ServerInstance "localhost" -Username "sa" -Password ")it8UmtqKxrW4@X7h+3NhSUB" -Query @"
EXEC sp_configure 'show advanced options', 1; RECONFIGURE;
EXEC sp_configure 'max server memory (MB)', 2048; RECONFIGURE;
"@
```
El cambio es **inmediato y permanente** (no requiere reiniciar SQL). Deja ~5.5 GB para Windows y Node.

> Nota: si `Invoke-SqlCmd` no existe, instala el módulo una vez con
> `Install-Module SqlServer -Scope CurrentUser -Force` o usa `sqlcmd -S localhost -U sa -P "..."`.

**Comprueba la salud de la RAM del sistema:**
```powershell
$os=Get-CimInstance Win32_OperatingSystem
"Libre: {0} MB de {1} MB" -f [math]::Round($os.FreePhysicalMemory/1024),[math]::Round($os.TotalVisibleMemorySize/1024)
Get-Process sqlservr,node | Select Name,@{N='RAM_MB';E={[math]::Round($_.WorkingSet64/1MB)}}
```
Si la RAM libre es muy baja (<500 MB), cierra apps pesadas (navegadores, OneDrive) o reinicia la máquina.

### 3.4 ¿Cambió la contraseña / credenciales?
Si el log dice `Login failed for user 'sa'`, las credenciales de `back\.env` (`DB_USER`, `DB_PASSWORD`,
`DB_SERVER`, `DB_PORT`, `DB_NAME`) no coinciden con SQL Server. Corrige `.env` y `pm2 restart alas`.

### 3.5 Reinicio limpio de la base (último recurso)
```powershell
Restart-Service MSSQLSERVER -Force
pm2 restart alas
Invoke-RestMethod -Uri "http://localhost:3000/api/health" | ConvertTo-Json
```

---

## 4. La IA de presupuestos falla (`status=401 invalid x-api-key`)

Solo afecta a la **generación de presupuestos con IA**, NO tira el sitio entero.

1. Abre `back\.env` y localiza `ANTHROPIC_API_KEY`.
2. Verifica que la key sea válida:
   ```powershell
   $h=@{ "x-api-key"="<PEGA_LA_KEY_AQUI>"; "anthropic-version"="2023-06-01"; "content-type"="application/json" }
   $b='{"model":"claude-haiku-4-5-20251001","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}'
   try { Invoke-RestMethod -Uri "https://api.anthropic.com/v1/messages" -Method POST -Headers $h -Body $b; "KEY OK" }
   catch { "KEY INVALIDA: "+$_.ErrorDetails.Message }
   ```
3. Si es inválida, genera una nueva en https://console.anthropic.com/ → API Keys, pégala en `.env`, y:
   ```powershell
   pm2 restart alas
   ```
   (PM2 vuelve a leer `.env` al reiniciar el proceso.)

---

## 5. El backend está OK pero el sitio no carga desde internet

Si `/api/health` responde `ok` en local pero el dominio público no abre:

1. **Cloudflare Tunnel** — revisa que el servicio del túnel esté corriendo:
   ```powershell
   Get-Service cloudflared -ErrorAction SilentlyContinue
   Get-Process cloudflared -ErrorAction SilentlyContinue
   ```
   Si está detenido: `Start-Service cloudflared` (o reinicia el proceso `cloudflared`).
2. Revisa el panel de Cloudflare (estado del túnel, DNS del dominio).
3. Prueba el sitio en modo local abriendo `http://localhost:3000` en el navegador.

---

## 6. Ruido que NO es una caída (ignóralo)

- `CORS bloqueado: http://localhost:3000` y peticiones a `/wp-login.php`, `/.env`, `/.git/config`, `/admin`:
  son **bots escaneando** o accesos con origen no permitido. Es comportamiento **esperado** (el sitio los rechaza).
  No indican una caída.
- `[SERVER] Pool no inicializado al arranque. Reintento en primera consulta.`:
  normal si Node arranca antes que SQL Server; se reconecta solo en la primera consulta.

---

## 7. Checklist de "todo arriba"

```powershell
pm2 status                                                        # alas -> online
Get-Service MSSQLSERVER                                            # Running
Test-NetConnection localhost -Port 1433                           # True
Invoke-RestMethod http://localhost:3000/api/health | ConvertTo-Json  # ok:true, db:ok
```
Los cuatro en verde = servicio sano.

---

## 8. Prevención (para que no vuelva a pasar)

1. **Límite de RAM de SQL Server ya aplicado** (2048 MB). No lo quites. Si algún día reinstalas SQL, vuelve a aplicarlo (sección 3.3).
2. **Considera ampliar la RAM** de la máquina: 7.8 GB es muy justo para SQL Server + Node + Windows.
3. **Monitoreo externo**: ten UptimeRobot (u otro) sondeando `https://alas-mantenimientointegral.com.mx/api/health`
   para enterarte de una caída antes que los clientes.
4. **Arranque automático**: PM2 ya está en el arranque de Windows (`pm2 save` guarda la lista). Tras cualquier
   cambio de procesos, corre `pm2 save` de nuevo.
5. Revisa periódicamente los eventos de paginación:
   ```powershell
   Get-WinEvent -LogName Application -MaxEvents 100 |
     Where-Object { $_.Message -like "*paged out*" } |
     Select-Object TimeCreated | Select-Object -First 5
   ```
   Si vuelven a aparecer seguido, la RAM se está agotando otra vez.
