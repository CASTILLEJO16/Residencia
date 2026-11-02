# SIO — Sistema de Gestión de Tickets

Sistema de gestión de incidentes con monitoreo de KPIs, alertas automáticas y auditoría. El enfoque principal es la gestión de tickets, con KPIs como herramienta de soporte para detectar problemas automáticamente.

## Estado

| Fase | Módulo | Estado |
|------|--------|--------|
| 1 | Autenticación y gestión de usuarios (LDAP + local) | Completa |
| 2 | Gestión de tickets (crear, asignar, escalar, cerrar) | Completa |
| 3 | Inteligencia: KPIs, umbrales, alertas y monitor | Completa |
| 4 | Dashboard de métricas de tickets | Completa |
| 5 | Reportes con exportación a Excel, PDF y CSV | Completa |
| 6 | Administración de usuarios y roles | Completa |
| 7 | Auditoría | Completa |
| 8 | Configuración del sistema | Completa |

## Requisitos

- Node.js 20 o superior
- SQLite (incluido: se usa `better-sqlite3`, no hace falta instalar nada aparte)

## Instalación

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Generar el secreto JWT y pegarlo en `.env` (`JWT_SECRET`):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Crear la base de datos y, opcionalmente, cargar los datos de demostración:

```bash
npm run db:init
npm run db:seed
```

Para trabajar con un escenario operativo completo (equipo de soporte, ~4 meses de
tickets, 12 KPIs con umbrales, histórico y alertas), en lugar de `db:seed` use:

```bash
npm run db:seed:real
```

Con `-- --reset` reemplaza los tickets, KPIs, alertas y bitácora existentes
(conserva los usuarios). Ver la sección *Escenario operativo* más abajo.

En producción no se cargan datos demo; en su lugar se crea el primer administrador:

```bash
npm run seed:admin
```

Arrancar el servidor (al arrancar aplica el esquema, así una base existente recibe
las tablas, índices y triggers que le falten):

```bash
npm start
```

La API queda en `http://localhost:4000`. Prueba: `GET /api/health`.

Otros scripts: `npm run db:reset` (borra la base y la crea de nuevo) y `npm test`.

> La base (`backend/data/sio.db`) **no se versiona**: contiene usuarios y hashes de
> contraseña. Cada instalación crea la suya.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Queda en `http://localhost:5173`, con proxy de `/api` al backend.

Para producción: `npm run build` genera `dist/`, que se sirve como archivos estáticos.

### 3. Usuarios de demostración

`npm run db:seed` crea estos usuarios con la contraseña de `SEED_PASSWORD`
(por defecto `Password123!`). **Todos deben cambiarla en su primer inicio de sesión.**

| Usuario | Rol |
|---------|-----|
| admin | SIO_Admin (Administrador) |
| analista1, analista2 | SIO_Analistas (Analista) |
| consulta1 | SIO_Consulta (Solo lectura) |
| auditor1 | SIO_Auditoria (Auditor) |

### 4. Escenario operativo (`npm run db:seed:real`)

Simula la mesa de ayuda de TI de una empresa en Ciudad de México:

- **Equipo:** 5 analistas, un líder de soporte (`rmorales`, recibe los
  escalamientos), una gerente con rol de consulta (`lgomez`) y un auditor
  (`hnavarro`), además del administrador. Todos con la contraseña de
  `SEED_PASSWORD` y cambio obligatorio al entrar.
- **Tickets:** ~15 por día hábil durante 120 días (más los lunes, pocos en fin de
  semana), en horario laboral, sobre 22 tipos de incidente reales (VPN, ERP,
  punto de venta, phishing, respaldos, timbrado...) y 11 áreas. Cada ticket
  tiene SLA según prioridad (crítica 4 h, alta 8 h, media 24 h, baja 72 h),
  asignación, comentarios, escalamientos, esperas y cierre con resolución, todo
  registrado en su historial y en la auditoría.
- **KPIs:** 12 indicadores calculados con consultas reales sobre los tickets
  (backlog, críticos, vencidos, sin asignar, cumplimiento de SLA, tiempo de
  resolución, flujo diario, distribución por estado y prioridad, volumen
  semanal, alertas activas y tabla de tickets que requieren atención), con
  umbrales y un histórico de 30 días.
- **Alertas:** las que esos umbrales habrían disparado en el periodo; el monitor
  sigue generando las nuevas al arrancar el servidor.

Los datos se generan con una semilla fija: el mismo comando produce el mismo
escenario, con fechas relativas al momento en que se ejecuta.

## Configuración de LDAP / Active Directory

Con `LDAP_URL` vacío el sistema usa solo la autenticación local. Para usar AD:

```bash
LDAP_URL=ldaps://dc01.empresa.com:636
LDAP_BASE_DN=DC=empresa,DC=com
LDAP_DOMAIN=empresa.com
LDAP_CA_CERT=C:\certs\empresa-ca.pem
LDAP_BIND_USER=CN=sio-service,CN=Users,DC=empresa,DC=com
LDAP_BIND_PASSWORD=...
```

Los grupos de AD se traducen a los roles del SIO (`SIO_Admin`, `SIO_Analistas`,
`SIO_Auditoria`, `SIO_Consulta`). Si en AD los grupos se llaman distinto, se indican
con `AD_GROUP_ADMIN`, `AD_GROUP_ANALISTAS`, `AD_GROUP_AUDITORIA` y
`AD_GROUP_CONSULTA`. Si el usuario está en varios, gana el de mayor privilegio.

**Fallback a login local.** Si el controlador de dominio no responde, el login
local solo se permite cuando `LDAP_FALLBACK_LOCAL=true`. Por defecto está activo en
desarrollo y **desactivado con `NODE_ENV=production`**, para que un corte de AD no
reabra las cuentas locales. Credenciales rechazadas, cuentas deshabilitadas o
bloqueadas en AD nunca caen al login local.

## Endpoints

### Autenticación — `/api/auth`

| Método | Ruta | Acceso |
|--------|------|--------|
| POST | `/login` | público |
| POST | `/refresh` | cookie `sio_rt` (httpOnly) |
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
leer `users.password_hash` o modificar datos. Hay dos barreras:

1. La real: `sqlExecutor` ejecuta la consulta en un **proceso aparte**
   (`kpiRunner.js`) que abre SQLite en modo **solo lectura** y con
   `PRAGMA query_only`. Aunque una consulta burlara la validación de texto,
   SQLite rechaza cualquier escritura.
2. La secundaria: validación de texto que exige un solo SELECT/WITH, sin
   comentarios, sin punto y coma intermedio, sin DDL ni DML, sin `SELECT INTO`,
   sin `PRAGMA`/`ATTACH` y sin leer las tablas internas del SIO (`users`,
   `refresh_tokens`, `audit_logs`, `sqlite_master`...).

El proceso aparte permite además cortar la consulta: si supera
`timeout_seconds` se mata el proceso y se responde 504, sin bloquear el servidor
(better-sqlite3 es síncrono; un hilo no se podría interrumpir). El resultado se
limita a `max_rows` sin modificar la consulta, así que los KPIs pueden usar su
propio `LIMIT`.

**Tokens.** El token de acceso dura 15 minutos y el frontend lo guarda **solo en
memoria**. El refresh es opaco, de 96 caracteres, viaja **únicamente en una cookie
`httpOnly`** (`SameSite=Strict`, `Path=/api/auth`, `Secure` en producción) y en la
base solo se guarda su SHA-256. Al recargar la página la sesión se recupera con
`/auth/refresh`. Cada uso consume el token y emite uno nuevo; si llega uno revocado
hace más de 30 segundos se cierran todas las sesiones del usuario (posible robo).
Un reuso de pocos segundos se trata como una carrera normal (dos pestañas) y solo
se rechaza. En el frontend, cuando varias peticiones reciben 401 a la vez, solo
una llama a `/auth/refresh` y las demás esperan en cola.

**Desactivación inmediata.** El middleware consulta el estado del usuario en cada
petición. Es una lectura extra, pero sin ella desactivar una cuenta no surte
efecto hasta que expire el token.

**Bloqueo de cuenta.** Cinco intentos fallidos bloquean 15 minutos. El login
también está limitado por IP a 10 intentos cada 15 minutos (`LOGIN_RATE_LIMIT`).
La respuesta es la misma si el usuario no existe o si la contraseña es incorrecta,
y se ejecuta un bcrypt ficticio cuando no se encuentra al usuario para que el
tiempo de respuesta no delate su existencia.

**Último administrador.** No se puede desactivar ni degradar al único admin
activo, ni desactivarse uno mismo.

**Sin borrado de usuarios.** Solo desactivación: las llaves foráneas de
incidentes, KPIs y auditoría necesitan que el registro siga existiendo.

**Auditoría.** El controlador declara `res.locals.audit = {...}` y la escritura
ocurre cuando la respuesta se cierra, ya con el código HTTP real. Las contraseñas
nunca llegan al registro.

## Cómo evita el sistema la avalancha de alertas

- Una sola alerta abierta por umbral. Si la condición sigue incumpliéndose, se
  incrementa `occurrence_count` en vez de abrir otra.
- `cooldown_minutes` define cuánto hay que esperar antes de volver a abrir una
  alerta del mismo umbral una vez resuelta.
- Cuando el KPI vuelve a su rango normal, las alertas abiertas de ese umbral se
  resuelven solas.

El monitor corre con node-cron cada minuto por defecto (`MONITOR_CRON`) y nunca
solapa ciclos: si el anterior sigue en curso, salta el turno. Los tickets
automáticos quedan a nombre del primer administrador activo.

## Base de datos

- SQLite con `better-sqlite3`, journal **WAL** y `foreign_keys = ON` durante toda
  la vida de la conexión. Cada escritura va directo al archivo (no se reescribe
  la base completa), así que un corte no la corrompe.
- El esquema está en `backend/scripts/create-schema-sqlite.sql` y es idempotente.
  Lo aplican `npm run db:init` y el servidor al arrancar.
- Las fechas se guardan en UTC (`YYYY-MM-DD HH:MM:SS`) y la API las devuelve en
  ISO 8601 con `Z`, para que el navegador las muestre en la hora local correcta.
- `updated_at` se mantiene con triggers `AFTER UPDATE`.
- `ticket_number` se genera con un trigger (`TCK-000001`) cuando no se indica.
- `kpi_history` guarda escalares para las series temporales; `kpi_snapshots`
  guarda el resultado completo en JSON y sirve de caché según `refresh_interval`.
- Al arrancar se avisa si hay registros que violan claves foráneas (pueden venir
  de versiones anteriores, que no las aplicaban).
- **Un solo proceso.** SQLite con una conexión de escritura: no ejecutar el
  backend en modo clúster (por ejemplo `pm2 -i`).

## Pruebas

```bash
cd backend
npm test
```

La suite (`backend/test/`, con `node:test`) usa una base temporal y cubre:

- Base de datos: claves foráneas activas tras escribir, rollback de
  transacciones, fechas en UTC, `lastInsertId` por consulta, triggers de
  `updated_at` y `ticket_number`.
- KPIs: consultas con `LIMIT` propio, truncado por `max_rows`, rechazo de tablas
  internas, conexión de solo lectura y corte por tiempo de una consulta infinita.
- Autenticación: refresh solo en cookie httpOnly, rotación con `replaced_by`,
  detección de reuso, logout, paginación de auditoría y bloqueo por intentos.
- Active Directory: traducción de grupos a roles, alta automática del usuario y
  que un AD caído, una cuenta bloqueada o credenciales inválidas no permitan el
  login local en producción.

## Pendiente

- `npm audit` del backend reporta avisos moderados heredados de `exceljs`
  (`archiver` → `glob`/`minimatch`). Solo afectan al empaquetado interno del XLSX,
  que no recibe patrones del usuario; la "corrección" automática degradaría
  exceljs a la versión 3. `uuid` se fuerza a 11.x mediante `overrides`.
- Definir si los KPIs leen solo de la base del SIO o de otras bases. Hoy
  `data_source` es una etiqueta libre y todas las consultas van a la misma base
  (en solo lectura).
