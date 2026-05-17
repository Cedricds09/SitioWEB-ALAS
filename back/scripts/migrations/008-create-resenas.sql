-- Migración 008 — tabla resenas
-- Reseñas de clientes: alta pública (validada contra dbo.notas) + moderación admin.
-- Estados: pendiente → aprobada | rechazada. Solo las aprobadas se publican.
-- Idempotente. Aplicar manualmente con SSMS o sqlcmd.

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'resenas')
BEGIN
  CREATE TABLE dbo.resenas (
    id               INT IDENTITY(1,1) PRIMARY KEY,
    numero_cliente   NVARCHAR(50)  NOT NULL,
    telefono         NVARCHAR(20)  NOT NULL,
    nombre_display   NVARCHAR(100) NOT NULL,
    colonia          NVARCHAR(100) NULL,
    tipo_servicio    NVARCHAR(50)  NULL,
    texto            NVARCHAR(1000) NOT NULL,
    estado           NVARCHAR(20)  NOT NULL DEFAULT 'pendiente',
    fecha_creacion   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    fecha_moderacion DATETIME2     NULL,
    activo           BIT           NOT NULL DEFAULT 1,
    CONSTRAINT CK_resenas_estado CHECK (estado IN ('pendiente','aprobada','rechazada'))
  );
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_resenas_estado')
BEGIN
  CREATE INDEX IX_resenas_estado ON dbo.resenas(estado, fecha_creacion DESC);
END
GO
