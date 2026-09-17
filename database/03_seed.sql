/* =============================================================
   03_seed.sql - Datos iniciales
   El usuario admin se crea con el script  npm run seed:admin
   (no se pone un hash fijo aqui para no dejar credenciales
    conocidas en el repositorio).
   ============================================================= */
SET NOCOUNT ON;
GO

MERGE dbo.roles AS target
USING (VALUES
    ('SIO_Admin',     N'Acceso total al sistema'),
    ('SIO_Analistas', N'Ve dashboard, configura KPIs y alertas, gestiona tickets'),
    ('SIO_Consulta',  N'Solo lectura de dashboard y reportes'),
    ('SIO_Auditoria', N'Solo acceso al modulo de auditoria y reportes')
) AS src (name, description)
ON target.name = src.name
WHEN NOT MATCHED THEN
    INSERT (name, description, is_system) VALUES (src.name, src.description, 1);
GO

MERGE dbo.system_config AS target
USING (VALUES
    ('app.name',                  N'Sistema de Inteligencia Operativa', 'string', N'Nombre visible'),
    ('auth.max_failed_attempts',  N'5',    'int',  N'Intentos fallidos antes del bloqueo'),
    ('auth.lockout_minutes',      N'15',   'int',  N'Minutos de bloqueo de cuenta'),
    ('auth.password_min_length',  N'10',   'int',  N'Longitud minima de contrasena'),
    ('kpi.history_retention_days',N'180',  'int',  N'Dias de retencion de kpi_history'),
    ('kpi.snapshot_retention_days',N'30',  'int',  N'Dias de retencion de kpi_snapshots'),
    ('audit.retention_days',      N'365',  'int',  N'Dias de retencion de audit_logs'),
    ('alerts.default_cooldown',   N'30',   'int',  N'Cooldown por defecto en minutos'),
    ('mail.enabled',              N'false','bool', N'Habilita el envio de correos')
) AS src (key_name, value, value_type, description)
ON target.key_name = src.key_name
WHEN NOT MATCHED THEN
    INSERT (key_name, value, value_type, description)
    VALUES (src.key_name, src.value, src.value_type, src.description);
GO
