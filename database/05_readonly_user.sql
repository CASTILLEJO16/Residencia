/* =============================================================
   05_readonly_user.sql
   Usuario dedicado para ejecutar las consultas de los KPIs.
   CRITICO: el sqlExecutor NUNCA debe usar la conexion de la app.
   Ajusta el nombre de la BD de origen y la contrasena.
   ============================================================= */

-- 1) Login a nivel servidor
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'sio_kpi_reader')
    CREATE LOGIN sio_kpi_reader WITH PASSWORD = 'CAMBIAR_ESTA_PASSWORD_LARGA';
GO

-- 2) Usuario en la BD de ORIGEN de datos (no la del SIO)
USE [BD_ORIGEN];
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'sio_kpi_reader')
    CREATE USER sio_kpi_reader FOR LOGIN sio_kpi_reader;
GO
ALTER ROLE db_datareader ADD MEMBER sio_kpi_reader;
GO
DENY VIEW ANY DEFINITION TO sio_kpi_reader;
DENY ALTER, CONTROL, INSERT, UPDATE, DELETE, EXECUTE ON SCHEMA::dbo TO sio_kpi_reader;
GO

-- 3) Negar explicitamente el acceso al esquema del SIO
USE [SIO];
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'sio_kpi_reader')
    CREATE USER sio_kpi_reader FOR LOGIN sio_kpi_reader;
GO
DENY SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO sio_kpi_reader;
GO
