-- =============================================================================
-- Migración 003: Agregar columna asignado_a a presupuestos
-- =============================================================================
-- Asignación de presupuestos a técnicos.
-- - Solicitudes públicas: el service asigna al primer técnico activo.
-- - Presupuestos creados por técnicos: autoasignados al creador.
-- - Presupuestos creados por admin: NULL (sin asignar) hasta reasignación.
-- =============================================================================

-- 1a. Agregar columna asignado_a (nullable, FK a usuarios)
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.presupuestos') AND name = 'asignado_a'
)
BEGIN
    ALTER TABLE dbo.presupuestos
    ADD asignado_a INT NULL;
END
GO

-- 1b. Crear FK constraint hacia usuarios(id)
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_presupuestos_asignado_a'
)
BEGIN
    ALTER TABLE dbo.presupuestos
    ADD CONSTRAINT FK_presupuestos_asignado_a
    FOREIGN KEY (asignado_a) REFERENCES dbo.usuarios(id);
END
GO

-- 2. Índice (no filtrado) para búsquedas por técnico asignado
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_presupuestos_asignado_a' AND object_id = OBJECT_ID('dbo.presupuestos')
)
BEGIN
    CREATE INDEX IX_presupuestos_asignado_a
    ON dbo.presupuestos (asignado_a);
END
GO
