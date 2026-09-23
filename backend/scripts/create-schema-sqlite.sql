-- Esquema SQLite para SIO
-- Ejecutar: sqlite3 data/sio.db < scripts/create-schema-sqlite.sql

-- Tabla de roles
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role_id INTEGER REFERENCES roles(id),
  is_active INTEGER DEFAULT 1,
  must_change_password INTEGER DEFAULT 0,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);

-- Tabla de refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  replaced_by INTEGER REFERENCES refresh_tokens(id),
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);

-- Tabla de configuración del sistema
CREATE TABLE IF NOT EXISTS system_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_name TEXT NOT NULL UNIQUE,
  value TEXT,
  value_type TEXT DEFAULT 'string',
  description TEXT,
  is_secret INTEGER DEFAULT 0,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de KPIs
CREATE TABLE IF NOT EXISTS kpis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  sql_query TEXT,
  data_source TEXT,
  refresh_interval INTEGER DEFAULT 300,
  max_rows INTEGER DEFAULT 1000,
  timeout_seconds INTEGER DEFAULT 15,
  widget_type TEXT,
  value_column TEXT,
  label_column TEXT,
  is_active INTEGER DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kpis_name ON kpis(name);
CREATE INDEX IF NOT EXISTS idx_kpis_active ON kpis(is_active);

-- Tabla de historico de KPIs
CREATE TABLE IF NOT EXISTS kpi_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kpi_id INTEGER NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
  value REAL,
  recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kpi_history_kpi ON kpi_history(kpi_id);
CREATE INDEX IF NOT EXISTS idx_kpi_history_recorded ON kpi_history(recorded_at);

-- Tabla de snapshots de KPIs
CREATE TABLE IF NOT EXISTS kpi_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kpi_id INTEGER NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
  payload TEXT,
  row_count INTEGER,
  duration_ms INTEGER,
  captured_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_kpi ON kpi_snapshots(kpi_id);

-- Tabla de umbrales
CREATE TABLE IF NOT EXISTS thresholds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kpi_id INTEGER NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  condition_type TEXT NOT NULL,
  threshold_value REAL,
  threshold_min REAL,
  threshold_max REAL,
  severity TEXT DEFAULT 'medium',
  cooldown_minutes INTEGER DEFAULT 5,
  last_triggered_at TEXT,
  auto_create_ticket INTEGER DEFAULT 0,
  notify_emails TEXT,
  is_active INTEGER DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_thresholds_kpi ON thresholds(kpi_id);

-- Tabla de alertas
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kpi_id INTEGER NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
  threshold_id INTEGER REFERENCES thresholds(id) ON DELETE SET NULL,
  severity TEXT DEFAULT 'medium',
  current_value REAL,
  triggered_at TEXT DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'open',
  occurrence_count INTEGER DEFAULT 1,
  last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
  acknowledged_by INTEGER REFERENCES users(id),
  acknowledged_at TEXT,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_alerts_kpi ON alerts(kpi_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_triggered ON alerts(triggered_at);

-- Tabla de tickets
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_number TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  alert_id INTEGER REFERENCES alerts(id) ON DELETE SET NULL,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'open',
  assigned_to INTEGER REFERENCES users(id),
  escalated_to INTEGER REFERENCES users(id),
  escalation_level INTEGER DEFAULT 0,
  due_date TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT,
  closed_by INTEGER REFERENCES users(id),
  resolution TEXT
);

CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at);

-- Tabla de historial de tickets
CREATE TABLE IF NOT EXISTS ticket_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  changed_by INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  comment TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket ON ticket_history(ticket_id);

-- Tabla de logs de auditoría
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  username TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  http_method TEXT,
  endpoint TEXT,
  status_code INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  old_values TEXT,
  new_values TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- Insertar rol de administrador por defecto
INSERT OR IGNORE INTO roles (id, name, description, is_system) 
VALUES (1, 'admin', 'Administrador del sistema', 1);
