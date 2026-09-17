import { dateTime } from '../../utils/format';

const ACTION_LABEL = {
  created: 'creó el incidente',
  assigned: 'cambió la asignación',
  escalated: 'escaló el incidente',
  status_changed: 'cambió el estado',
  priority_changed: 'cambió la prioridad',
  comment_added: 'comentó',
  closed: 'cerró el incidente',
  reopened: 'reabrió el incidente',
};

/**
 * Bitácora en orden cronológico. Es una secuencia real, así que la línea
 * vertical y el orden sí codifican información.
 */
export default function TicketHistory({ entries }) {
  if (!entries?.length) {
    return <p className="py-6 text-center text-[13px] text-ink-2">Sin movimientos todavía.</p>;
  }

  return (
    <ol className="relative space-y-4 pl-4">
      <span className="absolute bottom-2 left-[3px] top-2 w-px bg-rule" aria-hidden="true" />
      {entries.map((entry) => (
        <li key={entry.id} className="relative">
          <span
            className={`absolute -left-4 top-1.5 h-[7px] w-[7px] rounded-full
              ${entry.action === 'escalated' ? 'bg-sev-high'
                : entry.action === 'closed' ? 'bg-sev-ok' : 'bg-ink-3'}`}
            aria-hidden="true"
          />
          <p className="text-[13px]">
            <span className="font-medium">{entry.changed_by_name}</span>{' '}
            <span className="text-ink-2">{ACTION_LABEL[entry.action] || entry.action}</span>
            {entry.old_value && entry.new_value && (
              <span className="text-ink-2"> de {entry.old_value} a {entry.new_value}</span>
            )}
          </p>
          {entry.comment && (
            <p className="mt-1 whitespace-pre-wrap border-l-2 border-rule pl-2.5 text-[13px] leading-relaxed">
              {entry.comment}
            </p>
          )}
          <p className="mt-0.5 text-micro text-ink-3">{dateTime(entry.created_at)}</p>
        </li>
      ))}
    </ol>
  );
}
