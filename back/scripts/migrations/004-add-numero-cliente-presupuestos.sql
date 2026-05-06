-- =============================================================================
-- Migración 004: Agregar numero_cliente a presupuestos
-- =============================================================================
-- Integra presupuestos al modelo cliente existente (servicios/notas agrupan por
-- numero_cliente). Si el admin selecciona un cliente existente desde el
-- autocomplete, se persiste su numero_cliente. Si es cliente nuevo, queda NULL.
-- =============================================================================

-- 1. Agregar columna numero_cliente
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.presupuestos') AND name = 'numero_cliente'
)
BEGIN
    ALTER TABLE dbo.presupuestos
    ADD numero_cliente NVARCHAR(50) NULL;
END
GO

-- 2. Índice para búsquedas por cliente (NO filtrado, permite NULL)
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_presupuestos_numero_cliente'
      AND object_id = OBJECT_ID('dbo.presupuestos')
)
BEGIN
    CREATE INDEX IX_presupuestos_numero_cliente
    ON dbo.presupuestos (numero_cliente);
END
GO
