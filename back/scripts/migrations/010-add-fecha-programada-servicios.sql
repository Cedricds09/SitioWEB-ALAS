-- Migración 010 — fecha/hora programada en dbo.servicios
-- Permite agendar un servicio para una fecha y hora concretas (vista de
-- calendario semanal). Ambas columnas son NULL: un servicio sin programar
-- sigue funcionando igual que antes. Idempotente. Aplicar con SSMS o sqlcmd.

IF NOT EXISTS (
  SELECT * FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.servicios')
  AND name = 'fecha_programada'
)
BEGIN
  ALTER TABLE dbo.servicios
  ADD fecha_programada DATE NULL,
      hora_programada  TIME NULL;
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes
               WHERE name = 'IX_servicios_fecha_programada')
BEGIN
  CREATE INDEX IX_servicios_fecha_programada
    ON dbo.servicios(fecha_programada)
    WHERE fecha_programada IS NOT NULL;
END
GO
