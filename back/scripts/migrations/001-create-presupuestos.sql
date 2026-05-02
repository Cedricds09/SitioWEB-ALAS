-- ============================================================
-- Migración: módulo presupuestos (Fase 1)
-- Modelo: bloques flexibles tipados + items para secciones
-- Idempotente: usa IF NOT EXISTS, seguro de re-ejecutar.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'presupuestos')
BEGIN
    CREATE TABLE presupuestos (
        id                  INT IDENTITY(1,1) PRIMARY KEY,
        numero_presupuesto  NVARCHAR(20)  NOT NULL UNIQUE,
        servicio_id         INT           NULL,

        -- Cliente
        cliente_nombre      NVARCHAR(200) NOT NULL,
        cliente_telefono    NVARCHAR(50)  NULL,
        cliente_direccion   NVARCHAR(500) NULL,
        cliente_destinatario NVARCHAR(200) NULL,    -- ej: "Para Administración"

        -- Encabezado del documento
        ciudad              NVARCHAR(100) NOT NULL DEFAULT 'CDMX',
        fecha_documento     DATE          NOT NULL DEFAULT CAST(SYSUTCDATETIME() AS DATE),
        introduccion        NVARCHAR(MAX) NULL,      -- texto contextual al inicio
        nota_final          NVARCHAR(MAX) NULL,      -- cláusula comercial al final

        -- Términos comerciales
        vigencia_dias       INT           NOT NULL DEFAULT 7,
        adelanto_porcentaje DECIMAL(5,2)  NOT NULL DEFAULT 0,   -- 0 a 100
        moneda              NVARCHAR(10)  NOT NULL DEFAULT 'MXN',

        -- Totales (se recalculan en cada modificación)
        total_general       DECIMAL(12,2) NOT NULL DEFAULT 0,

        -- Workflow
        estado              NVARCHAR(20)  NOT NULL DEFAULT 'borrador',
        notas_internas      NVARCHAR(MAX) NULL,      -- privadas del técnico, no van al cliente

        -- Auditoría
        creado_por          INT           NOT NULL,
        fecha_creacion      DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
        fecha_modificacion  DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
        activo              BIT           NOT NULL DEFAULT 1,

        CONSTRAINT FK_presupuestos_servicio FOREIGN KEY (servicio_id)  REFERENCES servicios(id),
        CONSTRAINT FK_presupuestos_creador  FOREIGN KEY (creado_por)   REFERENCES usuarios(id),
        CONSTRAINT CK_presupuestos_estado   CHECK (estado IN ('borrador','enviado','aprobado','rechazado','convertido')),
        CONSTRAINT CK_presupuestos_adelanto CHECK (adelanto_porcentaje >= 0 AND adelanto_porcentaje <= 100),
        CONSTRAINT CK_presupuestos_vigencia CHECK (vigencia_dias > 0)
    );

    CREATE INDEX IX_presupuestos_estado   ON presupuestos(estado)      WHERE activo = 1;
    CREATE INDEX IX_presupuestos_servicio ON presupuestos(servicio_id) WHERE servicio_id IS NOT NULL;
    CREATE INDEX IX_presupuestos_creador  ON presupuestos(creado_por);
    CREATE INDEX IX_presupuestos_fecha    ON presupuestos(fecha_creacion DESC);
END

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'presupuesto_bloques')
BEGIN
    CREATE TABLE presupuesto_bloques (
        id                INT IDENTITY(1,1) PRIMARY KEY,
        presupuesto_id    INT           NOT NULL,
        orden             INT           NOT NULL,
        tipo              NVARCHAR(30)  NOT NULL,      -- 'texto'|'lista_vinetas'|'garantias'|'apartado_cerrado'|'seccion_items'
        titulo            NVARCHAR(300) NULL,           -- usado por apartado_cerrado y seccion_items
        contenido_texto   NVARCHAR(MAX) NULL,           -- texto plano (texto), descripción (apartado_cerrado), JSON array (lista_vinetas, garantias)
        subtotal          DECIMAL(12,2) NULL,           -- solo para apartado_cerrado
        activo            BIT           NOT NULL DEFAULT 1,

        CONSTRAINT FK_bloques_presupuesto FOREIGN KEY (presupuesto_id) REFERENCES presupuestos(id) ON DELETE CASCADE,
        CONSTRAINT CK_bloques_tipo        CHECK (tipo IN ('texto','lista_vinetas','garantias','apartado_cerrado','seccion_items')),
        CONSTRAINT CK_bloques_subtotal    CHECK (subtotal IS NULL OR subtotal >= 0)
    );

    CREATE INDEX IX_bloques_presupuesto ON presupuesto_bloques(presupuesto_id, orden) WHERE activo = 1;
END

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'presupuesto_bloque_items')
BEGIN
    CREATE TABLE presupuesto_bloque_items (
        id                INT IDENTITY(1,1) PRIMARY KEY,
        bloque_id         INT           NOT NULL,
        orden             INT           NOT NULL,
        descripcion       NVARCHAR(500) NOT NULL,
        cantidad          DECIMAL(10,2) NOT NULL DEFAULT 1,
        precio_unitario   DECIMAL(12,2) NOT NULL DEFAULT 0,
        es_opcional       BIT           NOT NULL DEFAULT 0,
        activo            BIT           NOT NULL DEFAULT 1,

        CONSTRAINT FK_items_bloque FOREIGN KEY (bloque_id) REFERENCES presupuesto_bloques(id) ON DELETE CASCADE,
        CONSTRAINT CK_items_cantidad CHECK (cantidad > 0),
        CONSTRAINT CK_items_precio   CHECK (precio_unitario >= 0)
    );

    CREATE INDEX IX_items_bloque ON presupuesto_bloque_items(bloque_id, orden) WHERE activo = 1;
END
