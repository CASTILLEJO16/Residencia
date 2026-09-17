import { useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Field from '../common/Field';
import { Input, Textarea, Select } from '../common/Input';
import { ticketApi } from '../../services/endpoints';
import { PRIORITY } from '../../utils/constants';

export default function TicketForm({ open, ticket, users, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    title: ticket?.title || '',
    description: ticket?.description || '',
    priority: ticket?.priority || 'medium',
    assignedTo: ticket?.assigned_to || '',
    dueDate: ticket?.due_date ? ticket.due_date.slice(0, 16) : '',
  }));
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setErrors([]);
    try {
      const payload = {
        title: form.title,
        priority: form.priority,
        ...(form.description ? { description: form.description } : {}),
        ...(form.dueDate ? { dueDate: new Date(form.dueDate).toISOString() } : {}),
      };
      if (ticket) {
        onSaved(await ticketApi.update(ticket.id, payload));
      } else {
        if (form.assignedTo) payload.assignedTo = Number(form.assignedTo);
        onSaved(await ticketApi.create(payload));
      }
    } catch (err) {
      setErrors(err.details?.map((d) => `${d.field}: ${d.message}`) || [err.message]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={ticket ? `Editar ${ticket.ticket_number}` : 'Nuevo incidente'}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            {ticket ? 'Guardar cambios' : 'Crear incidente'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {errors.length > 0 && (
          <div className="panel sev-edge border-l-sev-critical p-3">
            <ul className="space-y-0.5 text-[13px]">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}

        <Field label="Título" htmlFor="t-title" required
          hint="Describe el problema, no la solución. “El KPI de ventas no carga desde las 8:00”.">
          <Input id="t-title" required minLength={5} value={form.title}
            onChange={(e) => set({ title: e.target.value })} />
        </Field>

        <Field label="Detalle" htmlFor="t-desc">
          <Textarea id="t-desc" rows={5} value={form.description}
            onChange={(e) => set({ description: e.target.value })} />
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Prioridad" htmlFor="t-prio" required>
            <Select id="t-prio" value={form.priority}
              onChange={(e) => set({ priority: e.target.value })}>
              {Object.entries(PRIORITY).map(([value, meta]) => (
                <option key={value} value={value}>{meta.label}</option>
              ))}
            </Select>
          </Field>

          <Field label="Fecha compromiso" htmlFor="t-due">
            <Input id="t-due" type="datetime-local" value={form.dueDate}
              onChange={(e) => set({ dueDate: e.target.value })} />
          </Field>
        </div>

        {!ticket && (
          <Field label="Asignar a" htmlFor="t-assign"
            hint="Si lo dejas vacío queda en la bandeja común.">
            <Select id="t-assign" value={form.assignedTo}
              onChange={(e) => set({ assignedTo: e.target.value })}>
              <option value="">Sin asignar</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </Select>
          </Field>
        )}
      </form>
    </Modal>
  );
}
