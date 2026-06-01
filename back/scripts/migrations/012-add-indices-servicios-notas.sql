-- Migración 012 — índices de rendimiento en dbo.servicios y dbo.notas (T2)
-- Aditiva y sin efectos en resultados: solo acelera filtros frecuentes y evita
-- table scans cuando crezca el volumen. Idempotente. Aplicar con SSMS o sqlcmd.
--
-- servicios: listarServicios filtra WHERE activo=1 AND estado IN (...) [AND
--   tecnico_asignado=@tec] ORDER BY fecha_inicio DESC; listarPorCliente e
--   historial filtran WHERE activo=1 AND numero_cliente=@nc.
-- notas: listarPorCliente filtra WHERE numero_cliente=@nc.

-- 1) servicios: filtro por estado + técnico (listado del panel), con
--    fecha_inicio para cubrir también el ORDER BY. Filtrado a activos.
IF NOT EXISTS (
  SELECT * FROM sys.indexes
  WHERE name = 'IX_servicios_estado_tecnico'
    AND object_id = OBJECT_ID('dbo.servicios')
)
BEGIN
  CREATE INDEX IX_servicios_estado_tecnico
    ON dbo.servicios (estado, tecnico_asignado, fecha_inicio DESC)
    WHERE activo = 1;
END
GO

-- 2) servicios: historial por cliente (activos).
IF NOT EXISTS (
  SELECT * FROM sys.indexes
  WHERE name = 'IX_servicios_numero_cliente'
    AND object_id = OBJECT_ID('dbo.servicios')
)
BEGIN
  CREATE INDEX IX_servicios_numero_cliente
    ON dbo.servicios (numero_cliente)
    WHERE activo = 1;
END
GO

-- 3) notas: historial/consulta por cliente.
IF NOT EXISTS (
  SELECT * FROM sys.indexes
  WHERE name = 'IX_notas_numero_cliente'
    AND object_id = OBJECT_ID('dbo.notas')
)
BEGIN
  CREATE INDEX IX_notas_numero_cliente
    ON dbo.notas (numero_cliente);
END
GO
