-- Migración 007 — tabla ai_generations
-- Tracking por generación de IA: tokens, costo, modelo, modo, exitoso/fallido.
-- Alimenta el circuit breaker (>50 generaciones/hora globales → 429).
-- Idempotente. Aplicar manualmente con SSMS o sqlcmd.

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ai_generations')
BEGIN
    CREATE TABLE dbo.ai_generations (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id INT NOT NULL,
        presupuesto_id INT NOT NULL,
        tokens_input INT NOT NULL DEFAULT 0,
        tokens_output INT NOT NULL DEFAULT 0,
        costo_estimado_usd DECIMAL(10,6) NOT NULL DEFAULT 0,
        modelo NVARCHAR(50) NOT NULL,
        modo NVARCHAR(20) NOT NULL,
        exitoso BIT NOT NULL DEFAULT 1,
        error_mensaje NVARCHAR(500) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_ai_generations_user FOREIGN KEY (user_id) REFERENCES dbo.usuarios(id),
        CONSTRAINT FK_ai_generations_presupuesto FOREIGN KEY (presupuesto_id) REFERENCES dbo.presupuestos(id),
        CONSTRAINT CK_ai_generations_modo CHECK (modo IN ('generar_inicial', 'mejorar', 'agregar'))
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ai_generations_created_at')
BEGIN
    CREATE INDEX IX_ai_generations_created_at ON dbo.ai_generations(created_at DESC);
END
GO