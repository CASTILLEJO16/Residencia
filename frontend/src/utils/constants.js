export const ROLES = {
  ADMIN: 'SIO_Admin',
  ANALISTA: 'SIO_Analistas',
  CONSULTA: 'SIO_Consulta',
  AUDITORIA: 'SIO_Auditoria',
};

// Alias para DB local (admin, analista, operador, viewer, manager)
export const ROLE_ALIASES = {
  [ROLES.ADMIN]: [ROLES.ADMIN, 'admin'],
  [ROLES.ANALISTA]: [ROLES.ANALISTA, 'analista', 'operador', 'manager'],
  [ROLES.CONSULTA]: [ROLES.CONSULTA, 'viewer'],
  [ROLES.AUDITORIA]: [ROLES.AUDITORIA, 'auditoria'],
};

export function normalizeRole(role) {
  if (!role) return role;
  for (const [canonical, aliases] of Object.entries(ROLE_ALIASES)) {
    if (aliases.includes(role)) return canonical;
  }
  return role;
}

export function hasRoleAny(userRole, allowed) {
  const norm = normalizeRole(userRole);
  const allowedNorm = allowed.flat().map(normalizeRole);
  return allowedNorm.includes(norm);
}

export const SEVERITY = {
  low:      { label: 'Baja',    color: 'sev-low',      hex: '#3E7CB1', order: 3 },
  medium:   { label: 'Media',   color: 'sev-medium',   hex: '#B07D2B', order: 2 },
  high:     { label: 'Alta',    color: 'sev-high',     hex: '#C2410C', order: 1 },
  critical: { label: 'Critica', color: 'sev-critical', hex: '#9B1C1C', order: 0 },
};

export const PRIORITY = {
  low:      { label: 'Baja' },
  medium:   { label: 'Media' },
  high:     { label: 'Alta' },
  critical: { label: 'Critica' },
};

export const TICKET_STATUS = {
  open:        { label: 'Abierto' },
  in_progress: { label: 'En curso' },
  escalated:   { label: 'Escalado' },
  on_hold:     { label: 'En espera' },
  closed:      { label: 'Cerrado' },
};

export const ALERT_STATUS = {
  open:         { label: 'Abierta' },
  acknowledged: { label: 'Atendida' },
  resolved:     { label: 'Resuelta' },
};

export const WIDGET_TYPES = [
  { value: 'number', label: 'Cifra' },
  { value: 'gauge',  label: 'Indicador' },
  { value: 'line',   label: 'Linea' },
  { value: 'area',   label: 'Area' },
  { value: 'bar',    label: 'Barras' },
  { value: 'pie',    label: 'Pastel' },
  { value: 'table',  label: 'Tabla' },
];

export const CONDITIONS = [
  { value: 'greater_than', label: 'Mayor que' },
  { value: 'less_than',    label: 'Menor que' },
  { value: 'equals',       label: 'Igual a' },
  { value: 'not_equals',   label: 'Distinto de' },
  { value: 'between',      label: 'Dentro del rango' },
  { value: 'outside',      label: 'Fuera del rango' },
];

export const RANGE_CONDITIONS = ['between', 'outside'];
