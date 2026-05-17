-- Migración 009 — columna token_version en dbo.usuarios
-- Soporta revocación de sesiones (M3): el token lleva `tv`; al cerrar sesión
-- o cambiar contraseña se incrementa token_version y los tokens viejos dejan
-- de validar. Idempotente. Aplicar manualmente con SSMS o sqlcmd.

IF NOT EXISTS (
  SELECT * FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.usuarios')
  AND name = 'token_version'
)
BEGIN
  ALTER TABLE dbo.usuarios
  ADD token_version INT NOT NULL DEFAULT 0;
END
GO
