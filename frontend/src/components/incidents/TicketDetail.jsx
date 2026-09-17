import { useState } from 'react';
import { ArrowUpRight, UserPlus, MessageSquarePlus } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Field from '../common/Field';
import { Textarea, Select } from '../common/Input';
import { PriorityBadge, StatusBadge } from '../common/Badge';
import TicketHistory from './TicketHistory';
import { ticketApi } from '../../services/endpoints';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../contexts/ToastContext';
import { dateTime, isOverdue } from '../../utils/format';

export default function TicketDetail({ open, ticket, users, onClose, onChanged }) {
  const { canEdit, user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');
  const [panel, setPanel] = useState(null);
  const [escalation, setEscalation] = useState({ escalatedTo: '', reason: '' });
  const [closure, setClosure] = useState('');

  const closed = ticket.status === 'closed';

  const run = async (fn, message) => {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
      setPanel(null);
      onChanged();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`${ticket.ticket_number} · ${ticket.title}`}
      description={ticket.kpi_name ? `Originado por una alerta de ${ticket.kpi_name}` : undefined}
    >
      <div className="grid gap-5 md:grid-cols-[1fr_260px]">
        <div className="space-y-5">
          {ticket.description && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{ticket.description}</p>
          )}

          {closed && ticket.resolution && (
            <div className="panel sev-edge border-l-sev-ok p-3">
              <p className="text-[13px] font-medium">Resolución</p>
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">
                {ticket.resolution}
              </p>
            </div>
          )}

          {canEdit && !closed && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={UserPlus} onClick={() => setPanel('assign')}>Asignar</Button>
              <Button size="sm" icon={ArrowUpRight} onClick={() => setPanel('escalate')}>Escalar</Button>
              <Button size="sm" icon={MessageSquarePlus} onClick={() => setPanel('comment')}>Comentar</Button>
              <Button size="sm" variant="primary" onClick={() => setPanel('close')}>Cerrar incidente</Button>
            </div>
          )}

          {panel === 'assign' && (
            <ActionPanel title="Asignar el incidente" onCancel={() => setPanel(null)}>
              <Select
                value={ticket.assigned_to || ''}
                onChange={(e) => run(
                  () => ticketApi.assign(ticket.id, e.target.value ? Number(e.target.value) : null),
                  'Asignación actualizada'
                )}
                disabled={busy}
                aria-label="Responsable"
              >
                <option value="">Sin asignar</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </Select>
            </ActionPanel>
          )}

          {panel === 'escalate' && (
            <ActionPanel title="Escalar el incidente" onCancel={() => setPanel(null)}>
              <Field label="Escalar a" htmlFor="esc-to" required>
                <Select id="esc-to" value={escalation.escalatedTo}
                  onChange={(e) => setEscalation({ ...escalation, escalatedTo: e.target.value })}>
                  <option value="">Elige a quién</option>
                  {users.filter((u) => u.id !== ticket.assigned_to)
                    .map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </Select>
              </Field>
              <Field label="Motivo" htmlFor="esc-reason" required
                hint="Quien lo reciba verá este texto en el correo.">
                <Textarea id="esc-reason" rows={3} value={escalation.reason}
                  onChange={(e) => setEscalation({ ...escalation, reason: e.target.value })} />
              </Field>
              <Button
                variant="primary" size="sm" loading={busy}
                disabled={!escalation.escalatedTo || escalation.reason.trim().length < 5}
                onClick={() => run(
                  () => ticketApi.escalate(ticket.id, Number(escalation.escalatedTo), escalation.reason),
                  'Incidente escalado'
                )}
              >
                Escalar
              </Button>
            </ActionPanel>
          )}

          {panel === 'comment' && (
            <ActionPanel title="Agregar un comentario" onCancel={() => setPanel(null)}>
              <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)}
                placeholder="Qué encontraste, qué falta por hacer" />
              <Button
                variant="primary" size="sm" loading={busy} disabled={!comment.trim()}
                onClick={() => run(
                  async () => { await ticketApi.comment(ticket.id, comment); setComment(''); },
                  'Comentario agregado'
                )}
              >
                Comentar
              </Button>
            </ActionPanel>
          )}

          {panel === 'close' && (
            <ActionPanel title="Cerrar el incidente" onCancel={() => setPanel(null)}>
              <Field label="Resolución" htmlFor="close-res" required
                hint="Queda en el historial y en los reportes. Si el incidente vino de una alerta, cerrarlo también la resuelve.">
                <Textarea id="close-res" rows={3} value={closure}
                  onChange={(e) => setClosure(e.target.value)} />
              </Field>
              <Button
                variant="primary" size="sm" loading={busy} disabled={!closure.trim()}
                onClick={() => run(
                  () => ticketApi.changeStatus(ticket.id, 'closed', closure),
                  'Incidente cerrado'
                )}
              >
                Cerrar incidente
              </Button>
            </ActionPanel>
          )}

          <div>
            <h3 className="mb-3 text-[13px] font-semibold text-ink-2">Historial</h3>
            <TicketHistory entries={ticket.history} />
          </div>
        </div>

        <aside className="space-y-3 md:border-l md:border-rule md:pl-5">
          <Detail label="Estado">
            <StatusBadge value={ticket.status} />
          </Detail>
          <Detail label="Prioridad">
            <PriorityBadge value={ticket.priority} />
          </Detail>
          <Detail label="Asignado a">{ticket.assigned_to_name || 'Nadie todavía'}</Detail>
          {ticket.escalated_to_name && (
            <Detail label={`Escalado (nivel ${ticket.escalation_level})`}>
              {ticket.escalated_to_name}
            </Detail>
          )}
          <Detail label="Creado por">{ticket.created_by_name}</Detail>
          <Detail label="Creado">{dateTime(ticket.created_at)}</Detail>
          {ticket.due_date && (
            <Detail label="Compromiso">
              <span className={isOverdue(ticket.due_date, ticket.status) ? 'text-sev-high' : ''}>
                {dateTime(ticket.due_date)}
                {isOverdue(ticket.due_date, ticket.status) && ' · vencido'}
              </span>
            </Detail>
          )}
          {closed && <Detail label="Cerrado">{dateTime(ticket.closed_at)} por {ticket.closed_by_name}</Detail>}

          {closed && user && canEdit && (
            <Button
              size="sm" className="w-full" loading={busy}
              onClick={() => run(
                () => ticketApi.changeStatus(ticket.id, 'open'),
                'Incidente reabierto'
              )}
            >
              Reabrir
            </Button>
          )}
        </aside>
      </div>
    </Modal>
  );
}

function ActionPanel({ title, children, onCancel }) {
  return (
    <div className="panel space-y-3 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold">{title}</p>
        <button onClick={onCancel} className="text-[13px] text-ink-2 hover:text-ink">Cancelar</button>
      </div>
      {children}
    </div>
  );
}

function Detail({ label, children }) {
  return (
    <div>
      <p className="text-micro text-ink-3">{label}</p>
      <div className="mt-0.5 text-[13px]">{children}</div>
    </div>
  );
}

