-- =============================================================================
-- Migración 002: Agregar estado 'solicitud', columnas tipo_servicio y fuente
-- =============================================================================

-- 1a. Agregar columna tipo_servicio
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.presupuestos') AND name = 'tipo_servicio'
)
BEGIN
    ALTER TABLE dbo.presupuestos
    ADD tipo_servicio NVARCHAR(50) NULL;
END
GO

-- 1b. Agregar columna fuente (con DEFAULT nombrado explícitamente)
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.presupuestos') AND name = 'fuente'
)
BEGIN
    ALTER TABLE dbo.presupuestos
    ADD fuente NVARCHAR(30) NOT NULL
        CONSTRAINT DF_presupuestos_fuente DEFAULT 'admin';
END
GO

-- 2a. Drop del CHECK constraint viejo de estado (si existe)
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_presupuestos_estado'
)
BEGIN
    ALTER TABLE dbo.presupuestos DROP CONSTRAINT CK_presupuestos_estado;
END
GO

-- 2b. Recrear CHECK constraint de estado incluyendo 'solicitud'
ALTER TABLE dbo.presupuestos
ADD CONSTRAINT CK_presupuestos_estado
CHECK (estado IN ('solicitud','borrador','enviado','aprobado','rechazado','convertido'));
GO

-- 3. Agregar CHECK para fuente
IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = 'CK_presupuestos_fuente'
)
BEGIN
    ALTER TABLE dbo.presupuestos
    ADD CONSTRAINT CK_presupuestos_fuente
    CHECK (fuente IN ('admin','formulario_publico'));
END
GO

-- 4. Index filtrado para búsqueda rápida de solicitudes pendientes
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_presupuestos_solicitudes' AND object_id = OBJECT_ID('dbo.presupuestos')
)
BEGIN
    CREATE INDEX IX_presupuestos_solicitudes
    ON dbo.presupuestos (estado, fecha_creacion DESC)
    WHERE activo = 1 AND estado = 'solicitud';
END
GO
