/* =============================================================
   04_maintenance.sql - Purga de historicos
   Programar con SQL Agent o llamar desde node-cron.
   ============================================================= */
IF OBJECT_ID('dbo.sp_sio_purge_history', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_sio_purge_history;
GO
CREATE PROCEDURE dbo.sp_sio_purge_history AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @kpiDays INT, @snapDays INT, @auditDays INT, @rows INT = 1;

    SELECT @kpiDays   = TRY_CAST(value AS INT) FROM dbo.system_config WHERE key_name='kpi.history_retention_days';
    SELECT @snapDays  = TRY_CAST(value AS INT) FROM dbo.system_config WHERE key_name='kpi.snapshot_retention_days';
    SELECT @auditDays = TRY_CAST(value AS INT) FROM dbo.system_config WHERE key_name='audit.retention_days';

    -- Borrado por lotes para no bloquear la tabla
    WHILE @rows > 0
    BEGIN
        DELETE TOP (5000) FROM dbo.kpi_history
        WHERE recorded_at < DATEADD(DAY, -ISNULL(@kpiDays,180), SYSUTCDATETIME());
        SET @rows = @@ROWCOUNT;
    END

    SET @rows = 1;
    WHILE @rows > 0
    BEGIN
        DELETE TOP (5000) FROM dbo.kpi_snapshots
        WHERE captured_at < DATEADD(DAY, -ISNULL(@snapDays,30), SYSUTCDATETIME());
        SET @rows = @@ROWCOUNT;
    END

    SET @rows = 1;
    WHILE @rows > 0
    BEGIN
        DELETE TOP (5000) FROM dbo.audit_logs
        WHERE created_at < DATEADD(DAY, -ISNULL(@auditDays,365), SYSUTCDATETIME());
        SET @rows = @@ROWCOUNT;
    END

    DELETE FROM dbo.refresh_tokens WHERE expires_at < DATEADD(DAY, -7, SYSUTCDATETIME());
    DELETE FROM dbo.password_resets WHERE expires_at < DATEADD(DAY, -7, SYSUTCDATETIME());
END;
GO
