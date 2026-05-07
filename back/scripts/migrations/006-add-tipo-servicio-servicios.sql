-- =============================================================================
-- Migración 006: agregar tipo_servicio a dbo.servicios (Issue 29 — Fase 2.9)
-- =============================================================================
-- Form de creación de servicio admin agrega dropdown TIPO DE SERVICIO (gas,
-- plomería, eléctrica, pintura, soldadura, mantenimiento integral, otro).
-- La columna ya existe en presupuestos y se usa en el formulario público.
-- Esta migración la añade a dbo.servicios para consistencia.
-- =============================================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.servicios') AND name = 'tipo_servicio'
)
BEGIN
    ALTER TABLE dbo.servicios
    ADD tipo_servicio NVARCHAR(50) NULL;
END
GO
