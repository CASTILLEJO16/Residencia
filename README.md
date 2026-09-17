# SIO — Sistema de Inteligencia Operativa

Dashboard de KPIs, alertas por umbrales y gestión de incidentes sobre SQL Server.

## Estado

| Fase | Módulo | Estado |
|------|--------|--------|
| 1 | Autenticación y gestión de usuarios | Completa |
| 2 | Dashboard de KPIs | Completa |
| 3 | Inteligencia: umbrales, alertas y monitor | Completa |
| 4 | Incidentes (tickets) | Completa |
| 5 | Reportes con exportación a Excel, PDF y CSV | Completa |
| 6 | Administración de usuarios y roles | Completa |
| 7 | Auditoría | Completa |
| 8 | Configuración del sistema | Completa |

## Requisitos

- Node.js 18 o superior
- SQL Server 2016 o superior

## Instalación

### 1. Base de datos

```sql
CREATE DATABASE SIO;
```

```bash
sqlcmd -S localhost -U sa -P '...' -d SIO -i database/01_schema.sql
sqlcmd -S localhost -U sa -P '...' -d SIO -i database/02_triggers.sql
sqlcmd -S localhost -U sa -P '...' -d SIO -i database/03_seed.sql
sqlcmd -S localhost -U sa -P '...' -d SIO -i database/04_maintenance.sql
```

`05_readonly_user.sql` crea el usuario que ejecuta las consultas de los KPIs.
Antes de correrlo hay que cambiar `[BD_ORIGEN]` por el nombre real de la base de
datos de la que salen las cifras, y poner una contraseña. Sin este paso los KPIs
no funcionan, porque el backend se niega a ejecutarlos con la conexión de la
aplicación.

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Generar el secreto y pegarlo en `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Crear el primer administrador y arrancar:

```bash
npm run seed:admin
npm run dev
```

La API queda en `http://localhost:4000`. Prueba: `GET /api/health`.
El archivo `backend/api.http` tiene una colección de peticiones lista para
VS Code REST Client o el cliente HTTP de IntelliJ.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Queda en `http://localhost:5173`, con proxy de `/api` al backend, así que en
desarrollo no hace falta configurar CORS.

Para producción: `npm run build` genera `dist/`, que se sirve como archivos
estáticos detrás de IIS, nginx o el mismo Express.

## Endpoints

### Autenticación — `/api/auth`

| Método | Ruta | Acceso |
|--------|------|--------|
| POST | `/login` | público |
| POST | `/refresh` | público |
| POST | `/logout` | público |
| POST | `/logout-all` | autenticado |
| GET | `/me` | autenticado |
| POST | `/change-password` | autenticado |

### Usuarios — `/api/users`

`GET /` y `GET /:id` para Admin y Auditoría. `POST /`, `PUT /:id`,
`PATCH /:id/status`, `POST /:id/reset-password` y `POST /:id/unlock` solo Admin.

### Roles — `/api/roles`

Lectura para cualquier autenticado; escritura solo Admin. Los cuatro roles base
están marcados como del sistema y no se pueden modificar ni borrar.

### KPIs — `/api/kpis`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/dashboard` | Todos los KPIs activos con sus datos en una sola llamada |
| GET | `/:id/data` | Datos de un KPI; `?force=true` ignora la caché |
| GET | `/:id/history` | Serie histórica de valores escalares |
| POST | `/preview` | Ejecuta una consulta sin guardarla |
| POST | `/validate` | Revisa la consulta sin ejecutarla |

Crear y editar: Admin y Analistas. Eliminar: solo Admin.

### Umbrales — `/api/thresholds`

CRUD para Admin y Analistas, más `POST /:id/test`, que evalúa el umbral contra
el valor actual sin abrir ninguna alerta.

### Alertas — `/api/alerts`

`GET /`, `GET /:id` y `GET /summary` para todos los roles.
`POST /:id/acknowledge` y `POST /:id/resolve` para Admin y Analistas.
`GET /monitor` muestra el estado del monitor; `POST /monitor/run` fuerza un ciclo.

### Incidentes — `/api/tickets`

`GET /`, `GET /:id`, `GET /:id/history` y `GET /summary` para todos los roles.
`POST /`, `PUT /:id`, `/assign`, `/escalate`, `/status` y `/comments` para Admin
y Analistas. Filtros: `mine`, `unassigned`, `overdue`, `status`, `priority`, `search`.

### Reportes — `/api/reports`

`GET /` lista los reportes disponibles, `GET /:type` devuelve los datos en JSON y
`GET /:type/export?format=xlsx|csv|pdf` descarga el archivo. Tipos: `kpi_history`,
`alerts`, `incidents`, `audit`.

### Auditoría — `/api/audit`

`GET /` para Admin y Auditoría. Filtros: `userId`, `action`, `entityType`,
`from`, `to`.

### Configuración del sistema — `/api/config`

CRUD completo para Admin. Los valores marcados como secretos (`is_secret`) se
ocultan en la interfaz con `******`. Tipos de valor: `string`, `int`, `bool`,
`json`.

## Decisiones de seguridad

**El SQL de los KPIs es el punto más delicado del diseño.** La tabla `kpis`
guarda una consulta que después se ejecuta. Sin controles, un analista podría
leer `users.password_hash` o borrar tablas. Hay dos barreras:

1. La real: `sqlExecutor` usa `getReadOnlyPool()`, una conexión con credenciales
   distintas (`DB_RO_*`) cuyo usuario solo tiene SELECT sobre la base de origen y
   DENY explícito sobre el esquema del SIO.
2. La secundaria: validación de texto que exige un solo SELECT, sin comentarios,
   sin punto y coma intermedio, sin DDL ni DML, sin `SELECT INTO`, sin
   `OPENROWSET`, sin servidores vinculados y sin referencias a las tablas del
   sistema.

La segunda barrera por sí sola no basta: cualquier lista negra de palabras se
puede burlar. Si la conexión de solo lectura no está bien configurada, el sistema
no está protegido.

Además se aplican `SET ROWCOUNT` con el `max_rows` del KPI, un `LOCK_TIMEOUT` de
5 segundos y el `timeout_seconds` configurado, para que una consulta pesada no
bloquee la base de origen.

**Tokens.** El token de acceso dura 15 minutos. El refresh es opaco, de 96
caracteres, y en la base solo se guarda su SHA-256. Cada uso lo consume y emite
uno nuevo; si llega uno ya revocado se cierran todas las sesiones del usuario,
porque eso significa que alguien lo está reutilizando. En el frontend, cuando
varias peticiones reciben 401 a la vez, solo una llama a `/auth/refresh` y las
demás esperan en cola: sin eso el token rotaría varias veces en paralelo y la
sesión se cerraría sola.

**Desactivación inmediata.** El middleware consulta el estado del usuario en cada
petición. Es una lectura extra, pero sin ella desactivar una cuenta no surte
efecto hasta que expire el token.

**Bloqueo de cuenta.** Cinco intentos fallidos bloquean 15 minutos. El login
también está limitado por IP a 10 intentos cada 15 minutos. La respuesta es la
misma si el usuario no existe o si la contraseña es incorrecta, y se ejecuta un
bcrypt ficticio cuando no se encuentra al usuario para que el tiempo de respuesta
no delate su existencia.

**Último administrador.** No se puede desactivar ni degradar al único admin
activo, ni desactivarse uno mismo.

**Sin borrado de usuarios.** Solo desactivación: las llaves foráneas de
incidentes, KPIs y auditoría necesitan que el registro siga existiendo.

**Auditoría desde la Fase 1.** El middleware se instaló al principio porque toca
todos los controladores. El controlador declara `res.locals.audit = {...}` y la
escritura ocurre cuando la respuesta se cierra, ya con el código HTTP real. Las
contraseñas nunca llegan al registro.

## Cómo evita el sistema la avalancha de alertas

Tres mecanismos combinados:

- Un índice único filtrado permite una sola alerta abierta por umbral. Si la
  condición sigue incumpliéndose, se incrementa `occurrence_count` en vez de
  abrir otra.
- `cooldown_minutes` define cuánto hay que esperar antes de volver a abrir una
  alerta del mismo umbral una vez resuelta.
- Cuando el KPI vuelve a su rango normal, las alertas abiertas de ese umbral se
  resuelven solas.

El monitor corre con node-cron cada minuto por defecto (`MONITOR_CRON`) y nunca
solapa ciclos: si el anterior sigue en curso, salta el turno.

## Notas del esquema

- No hay tipo `JSON` en SQL Server antes de 2025: se usa `NVARCHAR(MAX)` con
  `CHECK (ISJSON(...) = 1)`.
- `updated_at` se mantiene con triggers `AFTER UPDATE`; el `DEFAULT` solo aplica
  al insertar.
- `kpi_history` guarda escalares para las series temporales; `kpi_snapshots`
  guarda el resultado completo en JSON y sirve de caché según `refresh_interval`.
- `UX_tickets_alert` hace real la relación uno a uno entre alerta e incidente.
- `ticket_number` es una columna calculada y persistida (`SIO-000001`).
- `sp_sio_purge_history` borra por lotes de 5000 filas para no bloquear las
  tablas; se ejecuta por cron a las 3:00 (`PURGE_CRON`).

## Pruebas realizadas

- Sintaxis verificada en todos los archivos del backend.
- La API arranca y responde: `/api/health` da 200, las rutas protegidas dan 401
  sin token, un cuerpo inválido da 400 con el detalle por campo.
- El validador de SQL bloquea los 13 casos de inyección probados: punto y coma
  con DROP, comentarios, lectura de `users`, DELETE, `SELECT INTO`, `OPENROWSET`,
  `EXEC`, servidores vinculados, `sys.tables` y consulta vacía. Acepta SELECT
  simple, CTE con `WITH` y punto y coma final.
- Los validadores de umbrales rechazan rangos sin mínimo o máximo, mínimo mayor
  que máximo, condiciones escalares sin valor, listas de correo mal formadas y
  severidades fuera del catálogo.
- La evaluación de condiciones da el resultado correcto en `greater_than`,
  `outside` (dentro y fuera) y con valor nulo.
- Los exportadores generan archivos válidos con 120 filas de prueba: CSV con BOM
  y comillas escapadas, XLSX reconocido como Excel 2007+, PDF multipágina.
- El frontend compila: `npm run build` sin errores.
- `npm audit` sin vulnerabilidades en el frontend. En el backend queda una
  moderada heredada de `exceljs`, que depende de una versión antigua de `uuid`;
  el aviso solo aplica cuando se pasa un búfer propio a `uuid`, cosa que no
  ocurre aquí, y la "corrección" automática degradaría exceljs a la versión 3.

## Lo que falta

- Pruebas automatizadas. No hay suite; todo lo anterior se verificó a mano.
- Migraciones versionadas. Los scripts de `database/` son idempotentes, pero
  conviene mover los cambios futuros a `backend/migrations/`.
- Definir si los KPIs leen de una sola base de origen o de varias. Hoy
  `data_source` es una etiqueta libre y todas las consultas van a la conexión
  `DB_RO_*`. Si hay varios orígenes, hace falta convertirlo en un catálogo de
  conexiones.
