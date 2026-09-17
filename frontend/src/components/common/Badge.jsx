import { SEVERITY, TICKET_STATUS, ALERT_STATUS, PRIORITY } from '../../utils/constants';

const TONE = {
  low:      'text-sev-low',
  medium:   'text-sev-medium',
  high:     'text-sev-high',
  critical: 'text-sev-critical',
  neutral:  'text-ink-2',
  ok:       'text-sev-ok',
};

/**
 * La severidad se lee por un punto de color mas el texto, nunca por color
 * solo: una etiqueta que solo cambia de color no se distingue con daltonismo
 * ni al imprimir un reporte en blanco y negro.
 */
export function SeverityBadge({ value, className = '' }) {
  const meta = SEVERITY[value] || { label: value };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${TONE[value] || TONE.neutral} ${className}`}>
      <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export function PriorityBadge({ value }) {
  const meta = PRIORITY[value] || { label: value };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${TONE[value] || TONE.neutral}`}>
      <span className="h-2 w-2 rounded-full bg-current" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

const STATUS_TONE = {
  open: 'border-sev-high text-sev-high',
  in_progress: 'border-steel text-steel',
  escalated: 'border-sev-critical text-sev-critical',
  on_hold: 'border-ink-3 text-ink-2',
  closed: 'border-rule text-ink-3',
  acknowledged: 'border-steel text-steel',
  resolved: 'border-rule text-ink-3',
};

export function StatusBadge({ value, kind = 'ticket' }) {
  const map = kind === 'alert' ? ALERT_STATUS : TICKET_STATUS;
  const meta = map[value] || { label: value };
  return (
    <span className={`inline-flex items-center rounded-panel border px-1.5 py-0.5 text-micro
      font-medium ${STATUS_TONE[value] || 'border-rule text-ink-2'}`}>
      {meta.label}
    </span>
  );
}
