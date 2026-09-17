/* =============================================================
   02_triggers.sql - Mantenimiento automatico de updated_at
   DEFAULT solo aplica en INSERT, por eso hace falta el trigger.
   ============================================================= */
SET NOCOUNT ON;
GO

IF OBJECT_ID('dbo.TR_roles_updated', 'TR') IS NOT NULL DROP TRIGGER dbo.TR_roles_updated;
GO
CREATE TRIGGER dbo.TR_roles_updated ON dbo.roles AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(updated_at)
        UPDATE r SET updated_at = SYSUTCDATETIME()
        FROM dbo.roles r INNER JOIN inserted i ON r.id = i.id;
END;
GO

IF OBJECT_ID('dbo.TR_users_updated', 'TR') IS NOT NULL DROP TRIGGER dbo.TR_users_updated;
GO
CREATE TRIGGER dbo.TR_users_updated ON dbo.users AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(updated_at)
        UPDATE u SET updated_at = SYSUTCDATETIME()
        FROM dbo.users u INNER JOIN inserted i ON u.id = i.id;
END;
GO

IF OBJECT_ID('dbo.TR_kpis_updated', 'TR') IS NOT NULL DROP TRIGGER dbo.TR_kpis_updated;
GO
CREATE TRIGGER dbo.TR_kpis_updated ON dbo.kpis AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(updated_at)
        UPDATE k SET updated_at = SYSUTCDATETIME()
        FROM dbo.kpis k INNER JOIN inserted i ON k.id = i.id;
END;
GO

IF OBJECT_ID('dbo.TR_thresholds_updated', 'TR') IS NOT NULL DROP TRIGGER dbo.TR_thresholds_updated;
GO
CREATE TRIGGER dbo.TR_thresholds_updated ON dbo.thresholds AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(updated_at)
        UPDATE t SET updated_at = SYSUTCDATETIME()
        FROM dbo.thresholds t INNER JOIN inserted i ON t.id = i.id;
END;
GO

IF OBJECT_ID('dbo.TR_tickets_updated', 'TR') IS NOT NULL DROP TRIGGER dbo.TR_tickets_updated;
GO
CREATE TRIGGER dbo.TR_tickets_updated ON dbo.tickets AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(updated_at)
        UPDATE t SET updated_at = SYSUTCDATETIME()
        FROM dbo.tickets t INNER JOIN inserted i ON t.id = i.id;
END;
GO
