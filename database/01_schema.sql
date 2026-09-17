/* =============================================================
   SIO - Sistema de Inteligencia Operativa
   01_schema.sql  -  Esquema completo (todas las fases)
   Motor: SQL Server 2016+
   Ejecutar con:  sqlcmd -S localhost -U sa -P '...' -d SIO -i 01_schema.sql
   ============================================================= */

SET NOCOUNT ON;
GO

/* -------------------------------------------------------------
   1. roles
   ------------------------------------------------------------- */
IF OBJECT_ID('dbo.roles', 'U') IS NULL
CREATE TABLE dbo.roles (
    id           INT            NOT NULL IDENTITY(1,1) PRIMARY KEY,
    name         NVARCHAR(50)   NOT NULL UNIQUE,
    description  NVARCHAR(255)  NULL,
    is_system    BIT            NOT NULL DEFAULT 0,  -- roles base: no se pueden borrar
    created_at   DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at   DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* -------------------------------------------------------------
   2. users
   ------------------------------------------------------------- */
IF OBJECT_ID('dbo.users', 'U') IS NULL
CREATE TABLE dbo.users (
    id                    INT            NOT NULL IDENTITY(1,1) PRIMARY KEY,
    username              NVARCHAR(50)   NOT NULL UNIQUE,
    password_hash         NVARCHAR(255)  NOT NULL,
    email                 NVARCHAR(150)  NOT NULL UNIQUE,
    full_name             NVARCHAR(150)  NOT NULL,
    role_id               INT            NOT NULL,
    is_active             BIT            NOT NULL DEFAULT 1,
    must_change_password  BIT            NOT NULL DEFAULT 0,
    failed_login_attempts INT            NOT NULL DEFAULT 0,
    locked_until          DATETIME2(3)   NULL,
    last_login            DATETIME2(3)   NULL,
    created_at            DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at            DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_users_role FOREIGN KEY (role_id) REFERENCES dbo.roles(id)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_users_role')
    CREATE INDEX IX_users_role ON dbo.users(role_id) INCLUDE (is_active);
GO

/* -------------------------------------------------------------
   3. refresh_tokens
   Se guarda el SHA-256 del token, nunca el token en claro.
   ------------------------------------------------------------- */
IF OBJECT_ID('dbo.refresh_tokens', 'U') IS NULL
CREATE TABLE dbo.refresh_tokens (
    id           BIGINT         NOT NULL IDENTITY(1,1) PRIMARY KEY,
    user_id      INT            NOT NULL,
    token_hash   CHAR(64)       NOT NULL UNIQUE,
    expires_at   DATETIME2(3)   NOT NULL,
    revoked_at   DATETIME2(3)   NULL,
    replaced_by  CHAR(64)       NULL,          -- rotacion de tokens
    ip_address   NVARCHAR(45)   NULL,
    user_agent   NVARCHAR(255)  NULL,
    created_at   DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_rt_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_rt_user_active')
    CREATE INDEX IX_rt_user_active ON dbo.refresh_tokens(user_id, expires_at)
        WHERE revoked_at IS NULL;
GO

/* -------------------------------------------------------------
   4. password_resets
   ------------------------------------------------------------- */
IF OBJECT_ID('dbo.password_resets', 'U') IS NULL
CREATE TABLE dbo.password_resets (
    id          BIGINT        NOT NULL IDENTITY(1,1) PRIMARY KEY,
    user_id     INT           NOT NULL,
    token_hash  CHAR(64)      NOT NULL UNIQUE,
    expires_at  DATETIME2(3)  NOT NULL,
    used_at     DATETIME2(3)  NULL,
    created_at  DATETIME2(3)  NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_pr_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
);
GO

/* -------------------------------------------------------------
   5. kpis
   sql_query se ejecuta con una conexion de SOLO LECTURA
   (ver DB_RO_USER en .env). Nunca con el usuario de la app.
   ------------------------------------------------------------- */
IF OBJECT_ID('dbo.kpis', 'U') IS NULL
CREATE TABLE dbo.kpis (
    id               INT            NOT NULL IDENTITY(1,1) PRIMARY KEY,
    name             NVARCHAR(100)  NOT NULL,
    description      NVARCHAR(255)  NULL,
    sql_query        NVARCHAR(MAX)  NOT NULL,
    data_source      NVARCHAR(100)  NULL,
    refresh_interval INT            NOT NULL DEFAULT 300,
    max_rows         INT            NOT NULL DEFAULT 1000,
    timeout_seconds  INT            NOT NULL DEFAULT 15,
    widget_type      NVARCHAR(20)   NOT NULL,
    value_column     NVARCHAR(100)  NULL,   -- columna escalar para umbrales
    label_column     NVARCHAR(100)  NULL,
    is_active        BIT            NOT NULL DEFAULT 1,
    created_by       INT            NULL,
    created_at       DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at       DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_kpis_user FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT CK_kpis_widget CHECK (widget_type IN
        ('line','bar','pie','gauge','number','table','area')),
    CONSTRAINT CK_kpis_interval CHECK (refresh_interval BETWEEN 30 AND 86400),
    CONSTRAINT CK_kpis_maxrows  CHECK (max_rows BETWEEN 1 AND 10000),
    CONSTRAINT CK_kpis_timeout  CHECK (timeout_seconds BETWEEN 1 AND 120)
);
GO

/* -------------------------------------------------------------
   6. kpi_history  -> solo valores escalares (number, gauge)
   ------------------------------------------------------------- */
IF OBJECT_ID('dbo.kpi_history', 'U') IS NULL
CREATE TABLE dbo.kpi_history (
    id          BIGINT          NOT NULL IDENTITY(1,1) PRIMARY KEY,
    kpi_id      INT             NOT NULL,
    recorded_at DATETIME2(3)    NOT NULL DEFAULT SYSUTCDATETIME(),
    value       DECIMAL(18,4)   NULL,
    CONSTRAINT FK_kh_kpi FOREIGN KEY (kpi_id) REFERENCES dbo.kpis(id)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_kh_kpi_time')
    CREATE INDEX IX_kh_kpi_time ON dbo.kpi_history(kpi_id, recorded_at DESC)
        INCLUDE (value);
GO

/* -------------------------------------------------------------
   7. kpi_snapshots -> resultado completo (series, tablas, pie)
   ------------------------------------------------------------- */
IF OBJECT_ID('dbo.kpi_snapshots', 'U') IS NULL
CREATE TABLE dbo.kpi_snapshots (
    id           BIGINT         NOT NULL IDENTITY(1,1) PRIMARY KEY,
    kpi_id       INT            NOT NULL,
    captured_at  DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    payload      NVARCHAR(MAX)  NOT NULL,
    row_count    INT            NOT NULL DEFAULT 0,
    duration_ms  INT            NULL,
    CONSTRAINT FK_ks_kpi FOREIGN KEY (kpi_id) REFERENCES dbo.kpis(id),
    CONSTRAINT CK_ks_json CHECK (ISJSON(payload) = 1)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ks_kpi_time')
    CREATE INDEX IX_ks_kpi_time ON dbo.kpi_snapshots(kpi_id, captured_at DESC);
GO

/* -------------------------------------------------------------
   8. thresholds  (con anti-spam de alertas)
   ------------------------------------------------------------- */
IF OBJECT_ID('dbo.thresholds', 'U') IS NULL
CREATE TABLE dbo.thresholds (
    id               INT            NOT NULL IDENTITY(1,1) PRIMARY KEY,
    kpi_id           INT            NOT NULL,
    name             NVARCHAR(100)  NOT NULL,
    condition_type   NVARCHAR(20)   NOT NULL,
    threshold_value  DECIMAL(18,4)  NULL,
    threshold_min    DECIMAL(18,4)  NULL,
    threshold_max    DECIMAL(18,4)  NULL,
    severity         NVARCHAR(20)   NOT NULL,
    cooldown_minutes INT            NOT NULL DEFAULT 30,
    last_triggered_at DATETIME2(3)  NULL,
    auto_create_ticket BIT          NOT NULL DEFAULT 0,
    notify_emails    NVARCHAR(500)  NULL,
    is_active        BIT            NOT NULL DEFAULT 1,
    created_by       INT            NULL,
    created_at       DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at       DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_th_kpi  FOREIGN KEY (kpi_id)     REFERENCES dbo.kpis(id),
    CONSTRAINT FK_th_user FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT CK_th_cond CHECK (condition_type IN
        ('greater_than','less_than','equals','not_equals','between','outside')),
    CONSTRAINT CK_th_sev  CHECK (severity IN ('low','medium','high','critical')),
    CONSTRAINT CK_th_vals CHECK (
        (condition_type IN ('between','outside')
            AND threshold_min IS NOT NULL AND threshold_max IS NOT NULL
            AND threshold_min <= threshold_max)
        OR
        (condition_type NOT IN ('between','outside') AND threshold_value IS NOT NULL)
    )
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_th_kpi_active')
    CREATE INDEX IX_th_kpi_active ON dbo.thresholds(kpi_id) WHERE is_active = 1;
GO

/* -------------------------------------------------------------
   9. alerts
   Indice unico filtrado: una sola alerta abierta por umbral.
   ------------------------------------------------------------- */
IF OBJECT_ID('dbo.alerts', 'U') IS NULL
CREATE TABLE dbo.alerts (
    id              BIGINT         NOT NULL IDENTITY(1,1) PRIMARY KEY,
    threshold_id    INT            NOT NULL,
    kpi_id          INT            NOT NULL,
    triggered_at    DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    current_value   DECIMAL(18,4)  NULL,
    message         NVARCHAR(500)  NULL,
    severity        NVARCHAR(20)   NOT NULL,
    status          NVARCHAR(20)   NOT NULL DEFAULT 'open',
    occurrence_count INT           NOT NULL DEFAULT 1,
    last_seen_at    DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    acknowledged_by INT            NULL,
    acknowledged_at DATETIME2(3)   NULL,
    resolved_at     DATETIME2(3)   NULL,
    CONSTRAINT FK_al_th   FOREIGN KEY (threshold_id)    REFERENCES dbo.thresholds(id),
    CONSTRAINT FK_al_kpi  FOREIGN KEY (kpi_id)          REFERENCES dbo.kpis(id),
    CONSTRAINT FK_al_user FOREIGN KEY (acknowledged_by) REFERENCES dbo.users(id),
    CONSTRAINT CK_al_status CHECK (status IN ('open','acknowledged','resolved')),
    CONSTRAINT CK_al_sev    CHECK (severity IN ('low','medium','high','critical'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_alerts_open_threshold')
    CREATE UNIQUE INDEX UX_alerts_open_threshold ON dbo.alerts(threshold_id)
        WHERE status = 'open';
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_alerts_status_time')
    CREATE INDEX IX_alerts_status_time ON dbo.alerts(status, triggered_at DESC)
        INCLUDE (kpi_id, severity);
GO

/* -------------------------------------------------------------
   10. tickets
   ------------------------------------------------------------- */
IF OBJECT_ID('dbo.tickets', 'U') IS NULL
CREATE TABLE dbo.tickets (
    id               INT            NOT NULL IDENTITY(1,1) PRIMARY KEY,
    ticket_number    AS ('SIO-' + RIGHT('000000' + CAST(id AS VARCHAR(6)), 6)) PERSISTED,
    title            NVARCHAR(200)  NOT NULL,
    description      NVARCHAR(MAX)  NULL,
    alert_id         BIGINT         NULL,
    priority         NVARCHAR(20)   NOT NULL,
    status           NVARCHAR(20)   NOT NULL DEFAULT 'open',
    assigned_to      INT            NULL,
    escalated_to     INT            NULL,
    escalation_level INT            NOT NULL DEFAULT 0,
    due_date         DATETIME2(3)   NULL,
    created_by       INT            NOT NULL,
    created_at       DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at       DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    closed_at        DATETIME2(3)   NULL,
    closed_by        INT            NULL,
    resolution       NVARCHAR(MAX)  NULL,
    CONSTRAINT FK_tk_alert    FOREIGN KEY (alert_id)     REFERENCES dbo.alerts(id),
    CONSTRAINT FK_tk_assigned FOREIGN KEY (assigned_to)  REFERENCES dbo.users(id),
    CONSTRAINT FK_tk_escal    FOREIGN KEY (escalated_to) REFERENCES dbo.users(id),
    CONSTRAINT FK_tk_creator  FOREIGN KEY (created_by)   REFERENCES dbo.users(id),
    CONSTRAINT FK_tk_closer   FOREIGN KEY (closed_by)    REFERENCES dbo.users(id),
    CONSTRAINT CK_tk_prio   CHECK (priority IN ('low','medium','high','critical')),
    CONSTRAINT CK_tk_status CHECK (status IN ('open','in_progress','escalated','on_hold','closed')),
    CONSTRAINT CK_tk_closed CHECK (
        (status = 'closed' AND closed_at IS NOT NULL AND closed_by IS NOT NULL)
        OR (status <> 'closed')
    )
);
GO
-- Relacion 1:1 real entre alerta y ticket
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_tickets_alert')
    CREATE UNIQUE INDEX UX_tickets_alert ON dbo.tickets(alert_id)
        WHERE alert_id IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tickets_status_assigned')
    CREATE INDEX IX_tickets_status_assigned ON dbo.tickets(status, assigned_to)
        INCLUDE (priority, created_at, due_date);
GO

/* -------------------------------------------------------------
   11. ticket_history
   ------------------------------------------------------------- */
IF OBJECT_ID('dbo.ticket_history', 'U') IS NULL
CREATE TABLE dbo.ticket_history (
    id         BIGINT         NOT NULL IDENTITY(1,1) PRIMARY KEY,
    ticket_id  INT            NOT NULL,
    changed_by INT            NOT NULL,
    action     NVARCHAR(50)   NOT NULL,
    field_name NVARCHAR(50)   NULL,
    old_value  NVARCHAR(255)  NULL,
    new_value  NVARCHAR(255)  NULL,
    comment    NVARCHAR(MAX)  NULL,
    created_at DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_th_ticket FOREIGN KEY (ticket_id)  REFERENCES dbo.tickets(id),
    CONSTRAINT FK_th_by     FOREIGN KEY (changed_by) REFERENCES dbo.users(id),
    CONSTRAINT CK_th_action CHECK (action IN
        ('created','assigned','escalated','status_changed','priority_changed',
         'comment_added','closed','reopened'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_thist_ticket')
    CREATE INDEX IX_thist_ticket ON dbo.ticket_history(ticket_id, created_at DESC);
GO

/* -------------------------------------------------------------
   12. audit_logs   (se usa desde la Fase 1)
   ------------------------------------------------------------- */
IF OBJECT_ID('dbo.audit_logs', 'U') IS NULL
CREATE TABLE dbo.audit_logs (
    id          BIGINT         NOT NULL IDENTITY(1,1) PRIMARY KEY,
    user_id     INT            NULL,
    username    NVARCHAR(50)   NULL,          -- desnormalizado: sobrevive al borrado
    action      NVARCHAR(100)  NOT NULL,
    entity_type NVARCHAR(50)   NULL,
    entity_id   NVARCHAR(50)   NULL,
    http_method NVARCHAR(10)   NULL,
    endpoint    NVARCHAR(255)  NULL,
    status_code INT            NULL,
    ip_address  NVARCHAR(45)   NULL,
    user_agent  NVARCHAR(255)  NULL,
    old_values  NVARCHAR(MAX)  NULL,
    new_values  NVARCHAR(MAX)  NULL,
    created_at  DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_au_user FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT CK_au_old CHECK (old_values IS NULL OR ISJSON(old_values) = 1),
    CONSTRAINT CK_au_new CHECK (new_values IS NULL OR ISJSON(new_values) = 1)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_audit_user_time')
    CREATE INDEX IX_audit_user_time ON dbo.audit_logs(created_at DESC)
        INCLUDE (user_id, action, entity_type);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_audit_entity')
    CREATE INDEX IX_audit_entity ON dbo.audit_logs(entity_type, entity_id, created_at DESC);
GO

/* -------------------------------------------------------------
   13. system_config
   ------------------------------------------------------------- */
IF OBJECT_ID('dbo.system_config', 'U') IS NULL
CREATE TABLE dbo.system_config (
    id          INT            NOT NULL IDENTITY(1,1) PRIMARY KEY,
    key_name    NVARCHAR(100)  NOT NULL UNIQUE,
    value       NVARCHAR(MAX)  NULL,
    value_type  NVARCHAR(20)   NOT NULL DEFAULT 'string',
    description NVARCHAR(255)  NULL,
    is_secret   BIT            NOT NULL DEFAULT 0,
    updated_by  INT            NULL,
    updated_at  DATETIME2(3)   NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_sc_user FOREIGN KEY (updated_by) REFERENCES dbo.users(id),
    CONSTRAINT CK_sc_type CHECK (value_type IN ('string','int','bool','json'))
);
GO
