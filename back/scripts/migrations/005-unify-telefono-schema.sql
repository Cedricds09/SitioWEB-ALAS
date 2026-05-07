-- =============================================================================
-- Migración 005: unificar columnas de teléfono a NVARCHAR(20) + CHECK constraints
-- =============================================================================
-- Deuda técnica resuelta:
--   1. servicios.telefono y notas.telefono eran VARCHAR(10) (rechazaban strings
--      con caracteres extra invisibles o formato → 500 al INSERT desde frontend,
--      Issue 25 de Fase 2.7).
--   2. presupuestos.cliente_telefono era NVARCHAR(50), inconsistente con el resto.
--   3. dbo.notas tenía un CHECK constraint legacy `chk_telefono_formato` que
--      bloqueaba el ALTER COLUMN. Lo dropeamos y lo reaplicamos con nombre
--      estándar a las 3 tablas (defensa en profundidad consistente).
--
-- Estado final esperado:
--   notas.telefono                NVARCHAR(20) NULL + CK_notas_telefono_formato
--   servicios.telefono            NVARCHAR(20) NULL + CK_servicios_telefono_formato
--   presupuestos.cliente_telefono NVARCHAR(20) NULL + CK_presupuestos_cliente_telefono_formato
--   usuarios.telefono             NVARCHAR(20) (no se toca, ya estaba bien)
--   presupuestos_backup_pre_produccion (no se toca, es backup)
--
-- Regla del CHECK (defensa en profundidad — el frontend y Zod ya validan):
--   telefono IS NULL OR (NOT telefono LIKE '%[^0-9]%' AND LEN(telefono) = 10)
--
-- Patrón idempotente: cada bloque chequea tipo/constraint actual antes de aplicar.
-- GO separators entre cada bloque (parser SQL Server resuelve referencias en el
-- mismo batch antes de ejecutar; lección de migración 002).
-- =============================================================================

-- 0. Drop del CHECK constraint legacy de notas si existe (bloquea el ALTER COLUMN).
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'chk_telefono_formato'
      AND parent_object_id = OBJECT_ID('dbo.notas')
)
BEGIN
    ALTER TABLE dbo.notas DROP CONSTRAINT chk_telefono_formato;
END
GO

-- 1. servicios.telefono → NVARCHAR(20)
IF EXISTS (
    SELECT 1
    FROM sys.columns c
    INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
    WHERE c.object_id = OBJECT_ID('dbo.servicios')
      AND c.name = 'telefono'
      AND (t.name <> 'nvarchar' OR c.max_length <> 40)  -- nvarchar(20) = 40 bytes
)
BEGIN
    ALTER TABLE dbo.servicios ALTER COLUMN telefono NVARCHAR(20) NULL;
END
GO

-- 2. notas.telefono → NVARCHAR(20)
IF EXISTS (
    SELECT 1
    FROM sys.columns c
    INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
    WHERE c.object_id = OBJECT_ID('dbo.notas')
      AND c.name = 'telefono'
      AND (t.name <> 'nvarchar' OR c.max_length <> 40)
)
BEGIN
    ALTER TABLE dbo.notas ALTER COLUMN telefono NVARCHAR(20) NULL;
END
GO

-- 3. presupuestos.cliente_telefono → NVARCHAR(20) (reduce desde 50; tabla en zeros para producción)
IF EXISTS (
    SELECT 1
    FROM sys.columns c
    INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
    WHERE c.object_id = OBJECT_ID('dbo.presupuestos')
      AND c.name = 'cliente_telefono'
      AND (t.name <> 'nvarchar' OR c.max_length <> 40)
)
BEGIN
    ALTER TABLE dbo.presupuestos ALTER COLUMN cliente_telefono NVARCHAR(20) NULL;
END
GO

-- 4. CK_notas_telefono_formato — solo dígitos, exactamente 10, NULL permitido
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_notas_telefono_formato'
      AND parent_object_id = OBJECT_ID('dbo.notas')
)
BEGIN
    ALTER TABLE dbo.notas
    ADD CONSTRAINT CK_notas_telefono_formato
    CHECK (telefono IS NULL OR (telefono NOT LIKE '%[^0-9]%' AND LEN(telefono) = 10));
END
GO

-- 5. CK_servicios_telefono_formato
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_servicios_telefono_formato'
      AND parent_object_id = OBJECT_ID('dbo.servicios')
)
BEGIN
    ALTER TABLE dbo.servicios
    ADD CONSTRAINT CK_servicios_telefono_formato
    CHECK (telefono IS NULL OR (telefono NOT LIKE '%[^0-9]%' AND LEN(telefono) = 10));
END
GO

-- 6. CK_presupuestos_cliente_telefono_formato
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_presupuestos_cliente_telefono_formato'
      AND parent_object_id = OBJECT_ID('dbo.presupuestos')
)
BEGIN
    ALTER TABLE dbo.presupuestos
    ADD CONSTRAINT CK_presupuestos_cliente_telefono_formato
    CHECK (cliente_telefono IS NULL OR (cliente_telefono NOT LIKE '%[^0-9]%' AND LEN(cliente_telefono) = 10));
END
GO
