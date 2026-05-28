-- Migración 011 — unique filtered index en dbo.resenas
-- Cierra race condition: contar + insert no era atómico, dos requests
-- concurrentes podían crear dos reseñas activas para el mismo cliente.
-- El service mantiene el pre-check (mensaje claro), y este índice cubre
-- como red de seguridad. Si el INSERT colisiona, SQL Server devuelve
-- error 2601 que el service traduce a ConflictError 409.
-- Idempotente. Aplicar manualmente con SSMS o sqlcmd.

IF NOT EXISTS (
  SELECT * FROM sys.indexes
  WHERE name = 'UX_resenas_cliente_activa'
    AND object_id = OBJECT_ID('dbo.resenas')
)
BEGIN
  CREATE UNIQUE INDEX UX_resenas_cliente_activa
    ON dbo.resenas (numero_cliente)
    WHERE estado IN ('pendiente','aprobada') AND activo = 1;
END
GO
