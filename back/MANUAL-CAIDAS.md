# Manual de recuperación — Servicio ALAS

Guía para diagnosticar y levantar el sitio **sin ayuda externa** cuando "se cae".
Escrito el 2026-09-13 tras una caída real. Léelo de arriba hacia abajo.

---

## 0. Cómo está montado el servicio (para entender qué puede fallar)

| Pieza | Qué es | Dónde vive |
|---|---|---|
| **Backend Node** | API Express que sirve el sitio | `back/src/server.js`, corre como **servicio nativo de Windows** `alas` (NSSM). Ver sección 10 |
| ~~PM2~~ *(retirado)* | Antes gestionaba Node; migrado a servicio nativo por causar caídas (daemons/EPERM) | histórico: `ecosystem.config.js`. Fallback solo si el servicio no existe |
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

> **`<PASSWORD_SA>`**: sustitúyelo por la contraseña del usuario `sa`, que está en
> `back/.env` como `DB_PASSWORD`. **Nunca** escribas la contraseña real en este archivo ni
> en ningún archivo versionado (el repo es público).

**Verifica el límite de memoria de SQL Server:**
```powershell
Invoke-SqlCmd -ServerInstance "localhost" -Username "sa" -Password "<PASSWORD_SA>" `
  -Query "SELECT value_in_use FROM sys.configurations WHERE name='max server memory (MB)'"
```
- Si sale **2147483647** (o un número enorme) → **está sin límite: ESE ES EL PROBLEMA.**

**Arréglalo (déjalo en 2048 MB = 2 GB):**
```powershell
Invoke-SqlCmd -ServerInstance "localhost" -Username "sa" -Password "<PASSWORD_SA>" -Query @"
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

## 5.1 El sitio da "Error 1033" de Cloudflare  ← CAÍDA REAL DEL 19/09

**El 1033 casi siempre es un SÍNTOMA, no la causa.** Significa que Cloudflare no tiene a quién
enrutar el dominio. El 19/09 pasó esto: el túnel `cloudflared` **estaba conectado** e internet OK,
pero **el backend estaba caído** (nadie escuchaba en el 3000), así que el túnel no tenía origen → 1033.
No te distraigas con Cloudflare: **primero confirma que el 3000 responde en local.**

### 5.1.1 Confirma dónde está el problema
```powershell
# ¿El backend responde en local?
Invoke-RestMethod -Uri "http://localhost:3000/api/health" | ConvertTo-Json
# ¿Nadie escucha el 3000?
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
# ¿El túnel sí está conectado al edge de Cloudflare? (debe haber conexiones a :7844)
Get-NetTCPConnection -OwningProcess (Get-Process cloudflared).Id |
  Where-Object RemotePort -eq 7844 | Select-Object State,RemoteAddress
```
- **3000 no responde / no escucha** pero cloudflared tiene conexiones a :7844 →
  el túnel está bien; **la causa es el backend caído**. Ve a la sección 2 (y si no arranca, a la 3).
- **cloudflared sin conexiones a :7844** → el problema sí es el túnel (sección 5).

### 5.1.2 ⭐ Trampa conocida: PM2 no responde (`connect EPERM \\.\pipe\rpc.sock`)
Si al intentar `pm2 status` / `pm2 restart alas` sale `connect EPERM \\.\pipe\rpc.sock` o
"Acceso denegado", es porque hay un **daemon de PM2 corriendo ELEVADO** (como Administrador) dueño
del pipe, y/o **daemons huérfanos acumulados** (cada `pm2` fallido lanza uno nuevo). Un PowerShell
**no-elevado no puede gestionarlo**. Diagnóstico:
```powershell
# ¿Cuántos daemons PM2 hay? (más de uno = problema)
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like "*Daemon.js*" } | Select-Object ProcessId,CommandLine
```

**Arréglalo desde un PowerShell ABIERTO COMO ADMINISTRADOR:**
```powershell
pm2 kill                          # mata el daemon elevado y limpia el pipe rpc.sock
# Si dejaste un backend suelto ocupando el 3000, libéralo primero:
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
cd C:\Users\Axel\Documents\GitHub\SitioWEB-ALAS\back
pm2 start ecosystem.config.js
pm2 save
Invoke-RestMethod http://localhost:3000/api/health | ConvertTo-Json
```

### 5.1.3 Restauración inmediata sin PM2 (parche mientras arreglas lo de arriba)
Si necesitas que el sitio vuelva YA y no puedes con PM2, arranca el backend suelto:
```powershell
cd C:\Users\Axel\Documents\GitHub\SitioWEB-ALAS\back
Start-Process node -ArgumentList "src/server.js" -WorkingDirectory (Get-Location) -WindowStyle Hidden
Start-Sleep 8
Invoke-RestMethod http://localhost:3000/api/health | ConvertTo-Json
```
> ⚠️ Es un **parche**: ese proceso NO está bajo PM2, **no se auto-reinicia** si se cae ni sobrevive
> a un reinicio de Windows. En cuanto puedas, déjalo bien con PM2 (5.1.2) para que quede permanente.

### 5.1.4 Verifica que el 1033 se fue (sitio público real)
```powershell
Invoke-WebRequest -Uri "https://alas-mantenimientointegral.com.mx/api/health" -UseBasicParsing |
  Select-Object StatusCode,Content
```
`StatusCode 200` con `"ok":true,"db":"ok"` = 1033 resuelto.

---

## 5.2 Causa B del 1033: el servicio Cloudflared se DETIENE o se CUELGA  ← CAÍDAS DEL 21/09

El 1033 tuvo una **segunda causa distinta** (dos veces el 21/09): el **backend estaba sano**
(`/api/health` local `ok:true`, 3000 sirviendo) pero el **servicio de Windows `Cloudflared`** se quedó
**colgado en "Stop Pending"** o directamente **"Stopped"** → sin conexiones a `:7844` → 1033.

Ojo con la trampa: las acciones de recuperación de SCM (`sc.exe qfailure Cloudflared`) **solo se disparan
si el proceso CRASHEA**, no cuando el servicio se detiene "limpio" o se cuelga en Stop Pending. Por eso
no se levantaba solo.

**Diagnóstico:**
```powershell
Get-Service Cloudflared | Select-Object Name,Status          # Stopped / Stop Pending = problema
$cf = Get-Process cloudflared -ErrorAction SilentlyContinue
Get-NetTCPConnection -OwningProcess $cf.Id | Where-Object RemotePort -eq 7844   # vacío = desconectado
```

**Arréglalo desde un PowerShell ABIERTO COMO ADMINISTRADOR** (un shell no-elevado da
"No se puede abrir el servicio Cloudflared"):
```powershell
Restart-Service Cloudflared -Force
# Si sigue en "Stop Pending" (colgado), mata el proceso y arráncalo:
Stop-Process -Id (Get-Process cloudflared).Id -Force
Start-Service Cloudflared
```
Verifica con la sección 5.1.4.

> **Para no volver a hacer esto a mano → activa la auto-recuperación (sección 9).** Un watchdog
> reinicia el túnel (y el backend) solo, sin que tengas que abrir PowerShell.

---

## 5.3 Causa C del 1033: el túnel hace FLAPPING (Running pero desconectado del edge)  ← CAÍDAS DEL 23/09

La causa más insidiosa: el servicio `Cloudflared` queda **`Running`** pero **pierde las conexiones
al edge** (`:7844`) → 1033/530 público durante 2-4 min hasta que reconecta o el watchdog lo reinicia.

**Causa raíz (evidencia en `C:\ProgramData\cloudflared\cloudflared.log`):**
- El túnel corría con **`--protocol http2`** (TCP). En una red casera con micro-cortes, la conexión
  TCP se rompe (`connectex: A socket operation was attempted to an unreachable network`) y cloudflared
  tiene que **re-registrar cada conexión** — ahí está la ventana de caída.
- Casi todas las conexiones caídas eran a IPs **IPv6** del edge (`2606:4700:...`) y el resolver DNS
  IPv6 fallaba (`wsasend: unreachable network`). **El IPv6 residencial es el eslabón inestable.**
- El propio precheck de cloudflared decía `Environment is healthy. cloudflared will use 'quic'`:
  QUIC (UDP) aguanta mucho mejor los micro-cortes y cambios de IP sin tirar el túnel.

**El arreglo (una sola vez, como Administrador):**
```powershell
# PowerShell -> "Ejecutar como administrador"
cd C:\Users\Axel\Documents\GitHub\SitioWEB-ALAS\back\scripts
.\harden-tunnel.ps1
```
`harden-tunnel.ps1` edita el `ImagePath` del servicio con **regex puntual** (el token queda intacto,
nunca se reconstruye la línea ni se imprime) para dejar:
- `--protocol quic`  (UDP; resiste el flapping mucho mejor que http2/TCP)
- `--edge-ip-version 4`  (fuerza IPv4 al edge; el IPv6 de esta casa flapea)
- `--retries 8`  (más reintentos ante error de conexión; default 5)
- `--grace-period 30s`  (drena peticiones en vuelo al reiniciar → menos cortes a usuarios)

Además sube la **prioridad** del proceso a `AboveNormal` y asegura su **MinWorkingSet** para que
Windows no lo pagine a disco bajo presión de RAM del escritorio. Es **idempotente** y trae
**rollback**: `.\harden-tunnel.ps1 -Rollback` (vuelve a `http2` y quita los flags; el token nunca se toca).

**Verifica el protocolo tras aplicar:**
```powershell
Select-String -Path C:\ProgramData\cloudflared\cloudflared.log -Pattern "Registered tunnel connection" |
  Select-Object -Last 4   # debe decir  protocol":"quic"
```

> **Honestidad estructural:** el `harden-tunnel.ps1` reduce la ventana y la frecuencia de cortes,
> pero **no elimina** la causa: la red/IPv6 residencial y la presión de RAM del escritorio. La
> robustez real llega con un **VPS pequeño** (RAM dedicada, sin apps de escritorio, mejor red) o
> subiendo la RAM de la máquina. Ver sección 8.

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
6. **Endurecimiento del túnel aplicado** (`harden-tunnel.ps1`, sección 5.3): QUIC + IPv4 al edge +
   reintentos + prioridad de proceso. No lo quites. Si reinstalas cloudflared, vuelve a correrlo.

### 8.1 ⭐ Veredicto estructural HONESTO (léelo)

Las mejoras de software (watchdog cada 1 min, `harden-tunnel.ps1`, blindaje anti-paginación)
**reducen** la frecuencia y la duración de los cortes, pero **NO los eliminan**. El techo es el hardware:

- **Es un escritorio interactivo de 7.8 GB** compartido con Chrome (~615 MB), Spotify (~400 MB),
  Edge WebView (~380 MB), Defender (~300 MB), etc. SQL y Node compiten por lo que sobra y Windows
  los pagina a disco → la DB tarda o falla, y `cloudflared` puede quedar sin CPU/red a tiempo.
- **La red es residencial** (Wi-Fi/IPv6 casero). El flapping del túnel es, en el fondo, la conexión
  a internet cayéndose a ratos. Ningún flag lo arregla del todo: solo lo hace menos doloroso.

**Riesgo residual tras estas mejoras:** los cortes públicos deberían pasar de varios minutos a
**~30-60 s** (lo que tarda el watchdog de 1 min + reconexión QUIC), y bajar bastante en frecuencia,
pero **seguirá habiéndolos** cada vez que la red parpadee o la RAM se sature. No es 99.9% de uptime.

**La única robustez real (elige uno):**

1. **Migrar a un VPS pequeño** (lo recomendado). Specs mínimas sobradas para este stack:
   - **2 vCPU / 2-4 GB RAM / 40-50 GB SSD**, Linux (Ubuntu 22.04) o Windows si SQL Server lo exige.
   - Con SQL Server: mejor **4 GB RAM** (o migrar a PostgreSQL/MySQL, que corren cómodos en 2 GB).
   - Proveedores y coste aprox.: Hetzner CX22 (~4-5 EUR/mes, 2 vCPU/4 GB), DigitalOcean/Vultr/Linode
     (~6-12 USD/mes, 1-2 vCPU/2 GB), Azure/AWS más caro si necesitas Windows+SQL con licencia.
   - **Ventaja:** RAM dedicada, sin apps de escritorio robando memoria, red de datacenter estable
     (cloudflared deja de flapear), y la máquina de casa se puede apagar sin tumbar el sitio.
   - **Esfuerzo de migración:** bajo-medio. Instalar Node + la DB, clonar el repo, variables de
     entorno, restaurar el backup de SQL (o migrar el esquema), y correr `cloudflared` con el
     **mismo token** en el VPS (el túnel es portátil: apuntas el connector desde el otro host).
     1-2 tardes de trabajo. El `harden-tunnel.ps1` deja de hacer falta (en Linux se usa el service
     unit de cloudflared, ya estable).

2. **Subir la RAM de la máquina de casa** a **16 GB** (parche, no solución de red): quita la presión
   de paginación de SQL/Node por ~30-60 USD de RAM, pero **no arregla el flapping del túnel** (eso
   es la conexión a internet). Solo tiene sentido si además la red de casa es fiable.

**Recomendación:** VPS de 2 vCPU / 4 GB (~5 USD/mes). Es la diferencia entre "se cae a ratos y el
watchdog lo levanta" y "está siempre arriba".

---

## 9. ⭐ Auto-recuperación (para NO volver a levantar el sitio a mano)

Tras 3 caídas en pocos días por causas distintas (backend, y túnel dos veces), hay un **watchdog
que se cura solo**. Se configura **una sola vez** y después el sistema se recupera sin que abras PowerShell.

### Qué hace
`scripts/watchdog-alas.ps1` corre **cada 1 minuto** (y 90s tras arrancar Windows) como Tarea Programada
`ALAS-SelfHeal`, con privilegios elevados y `PM2_HOME` fijo (para hablar SIEMPRE con el daemon PM2
correcto y no fabricar daemons huérfanos). En cada pasada:
- **Backend Node muerto** (`/api/health` no responde nada) → reinicia el servicio nativo `alas`
  (NSSM); de respaldo, `pm2 restart alas`/`pm2 resurrect` si aún estás en PM2.
- **DB caída** (`/api/health` responde pero `db!=ok`) → arranca `MSSQLSERVER` si está parado;
  **no** reinicia `alas` (el proceso está sano; reiniciarlo no arregla SQL — ver 3.3).
- **Túnel** (servicio `Cloudflared` no Running o sin conexiones a `:7844`) → reinicia el servicio,
  y si está colgado en "Stop Pending" lo destraba matando el proceso. **Esto es lo que cura el
  flapping de la sección 5.3.**
- **Log gigante** de cloudflared (>150 MB) → rotación real reiniciando el servicio un instante.
  La prevención principal es `--loglevel warn`, que `setup-selfheal.ps1` deja aplicado en origen.
- **Blindaje anti-paginación**: en cada pasada re-fija prioridad `AboveNormal` y `MinWorkingSet`
  de `node` (alas) y `cloudflared` (un reinicio de servicio los resetea; esto los vuelve a proteger).
- **Monitoreo de RAM**: si la RAM libre baja de **600 MB**, registra los mayores consumidores en el
  log (diagnóstico; **no mata apps del usuario**). A lo sumo una anotación cada 30 min.
- **Histéresis**: exige **2 fallos consecutivos** (con ~1 min entre pasadas) antes de reiniciar
  backend o túnel, para no cortar usuarios en vivo por un pico transitorio.
- Es idempotente: si todo está sano, no toca nada. Registra sus acciones en
  `C:\ProgramData\alas-watchdog\watchdog.log`.

### Activarlo (UNA sola vez, como Administrador) — ORDEN RECOMENDADO
```powershell
# PowerShell -> "Ejecutar como administrador"
cd C:\Users\Axel\Documents\GitHub\SitioWEB-ALAS\back\scripts
.\harden-tunnel.ps1     # 1) endurece el túnel (quic + IPv4 + retries)  — sección 5.3
.\setup-selfheal.ps1    # 2) registra/actualiza el watchdog (cada 1 min) y recuperación SCM
```
`harden-tunnel.ps1` puede reejecutarse sin daño (idempotente) y revertirse con `-Rollback`.
`setup-selfheal.ps1` registra la tarea (cada 1 min + al arranque). A partir de ahí, olvídate de
arreglarlo a mano.

### Comprobar que está trabajando
```powershell
Get-ScheduledTask ALAS-SelfHeal | Select-Object TaskName,State          # Ready/Running
Get-Content C:\ProgramData\alas-watchdog\watchdog.log -Tail 20          # historial de curas
```

### Desactivarlo (si hiciera falta)
```powershell
Unregister-ScheduledTask -TaskName ALAS-SelfHeal -Confirm:$false
```

> El watchdog **cura**, pero conviene igual tener **UptimeRobot** (sección 8.3) sondeando el endpoint
> público para que te **avise** cuando algo falló, aunque se haya auto-recuperado.
>
> **Solución de fondo:** el backend ya se migró a servicio nativo (sección 10). Si las caídas
> persisten por RAM, el siguiente paso es migrar a un VPS pequeño con más memoria (la máquina
> casera de 7.8 GB para SQL + Node + túnel es el techo estructural).

---

## 10. ⭐ Backend como servicio nativo de Windows (NSSM) — reemplaza a PM2

Tras varias caídas relacionadas con PM2 (daemons huérfanos, `EPERM \\.\pipe\rpc.sock`, mezcla de
contextos elevado/no-elevado), el backend se **migró a un servicio nativo** llamado `alas`, gestionado
por **NSSM**. Ventajas: arranca en el boot **sin login**, lo controla el SCM, se reinicia solo si el
proceso muere, tiene rotación de logs propia, y **elimina de raíz todo el problema de PM2**.

### Migrar (UNA sola vez, como Administrador)
```powershell
cd C:\Users\Axel\Documents\GitHub\SitioWEB-ALAS\back\scripts
.\install-backend-service.ps1
```
El script: instala NSSM (choco/winget) si falta, **retira `alas` de PM2** y baja el daemon, crea el
servicio `alas` (node `src/server.js`, `NODE_ENV=production`, `PORT=3000`, auto-arranque, logs con
rotación en `C:\ProgramData\alas`), lo arranca y verifica `/api/health`. Hay ~10-20s de corte durante
el cambio. Si algo sale mal, imprime el log de error y te recuerda el rollback.

### Operación diaria (ya NO se usa `pm2`)
```powershell
Get-Service alas                 # estado
Restart-Service alas             # reiniciar
Get-Content C:\ProgramData\alas\alas-err.log -Tail 40   # errores
Get-Content C:\ProgramData\alas\alas-out.log -Tail 40   # salida
```
> Las secciones 2 y 5.1.2 hablan de `pm2 restart alas`: eso quedó **obsoleto**. Ahora es
> `Restart-Service alas`. El watchdog (sección 9) ya detecta el servicio y lo usa automáticamente;
> solo cae a PM2 si el servicio no existiera.

### Rollback (volver a PM2)
```powershell
cd C:\Users\Axel\Documents\GitHub\SitioWEB-ALAS\back\scripts
.\uninstall-backend-service.ps1
# luego, si quieres PM2 de vuelta:
cd ..
pm2 start ecosystem.config.js ; pm2 save
```

### Orden de activación recomendado
1. `.\install-backend-service.ps1`  → backend como servicio (retira PM2).
2. `.\setup-selfheal.ps1`           → watchdog cada 1 min (túnel + backend + SQL).
Con ambos, el sistema arranca y se recupera solo, sin abrir PowerShell.
