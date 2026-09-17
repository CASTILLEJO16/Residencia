import { useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Field from '../common/Field';
import { Input, Select } from '../common/Input';
import { thresholdApi } from '../../services/endpoints';
import { CONDITIONS, RANGE_CONDITIONS, SEVERITY } from '../../utils/constants';

const EMPTY = {
  kpiId: '', name: '', conditionType: 'greater_than',
  thresholdValue: '', thresholdMin: '', thresholdMax: '',
  severity: 'medium', cooldownMinutes: 30,
  autoCreateTicket: false, notifyEmails: '', isActive: true,
};

export default function ThresholdForm({ open, threshold, kpis, defaultKpiId, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    threshold ? fromRecord(threshold) : { ...EMPTY, kpiId: defaultKpiId || '' });
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const isRange = RANGE_CONDITIONS.includes(form.conditionType);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setErrors([]);
    try {
      const payload = toPayload(form, isRange);
      const saved = threshold
        ? await thresholdApi.update(threshold.id, payload)
        : await thresholdApi.create(payload);
      onSaved(saved);
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
      title={threshold ? `Editar ${threshold.name}` : 'Nuevo umbral'}
      description="Cuando el valor del indicador cumpla esta condición se abrirá una alerta."
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            {threshold ? 'Guardar cambios' : 'Crear umbral'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {errors.length > 0 && (
          <div className="panel sev-edge border-l-sev-critical p-3">
            <ul className="space-y-0.5 text-[13px]">
              {errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          </div>
        )}

        {!threshold && (
          <Field label="Indicador" htmlFor="th-kpi" required>
            <Select id="th-kpi" required value={form.kpiId}
              onChange={(e) => set({ kpiId: e.target.value })}>
              <option value="">Elige un indicador</option>
              {kpis.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </Select>
          </Field>
        )}

        <Field label="Nombre del umbral" htmlFor="th-name" required
          hint="Aparece en la alerta y en el correo. Sé concreto: “Ventas por debajo de la meta diaria”.">
          <Input id="th-name" required value={form.name}
            onChange={(e) => set({ name: e.target.value })} />
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Condición" htmlFor="th-cond" required>
            <Select id="th-cond" value={form.conditionType}
              onChange={(e) => set({ conditionType: e.target.value })}>
              {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label="Severidad" htmlFor="th-sev" required>
            <Select id="th-sev" value={form.severity}
              onChange={(e) => set({ severity: e.target.value })}>
              {Object.entries(SEVERITY).map(([value, meta]) => (
                <option key={value} value={value}>{meta.label}</option>
              ))}
            </Select>
          </Field>
        </div>

        {isRange ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Mínimo" htmlFor="th-min" required>
              <Input id="th-min" type="number" step="any" required value={form.thresholdMin}
                onChange={(e) => set({ thresholdMin: e.target.value })} />
            </Field>
            <Field label="Máximo" htmlFor="th-max" required>
              <Input id="th-max" type="number" step="any" required value={form.thresholdMax}
                onChange={(e) => set({ thresholdMax: e.target.value })} />
            </Field>
          </div>
        ) : (
          <Field label="Valor" htmlFor="th-value" required>
            <Input id="th-value" type="number" step="any" required value={form.thresholdValue}
              onChange={(e) => set({ thresholdValue: e.target.value })} />
          </Field>
        )}

        <Field
          label="Minutos de espera entre alertas"
          htmlFor="th-cooldown"
          hint="Con 0 se abre una alerta en cada ciclo del monitor mientras la condición siga cumpliéndose."
        >
          <Input id="th-cooldown" type="number" min={0} max={1440} value={form.cooldownMinutes}
            onChange={(e) => set({ cooldownMinutes: Number(e.target.value) })} />
        </Field>

        <Field label="Avisar por correo a" htmlFor="th-mails" hint="Separa varias direcciones con comas">
          <Input id="th-mails" value={form.notifyEmails} placeholder="operaciones@empresa.com"
            onChange={(e) => set({ notifyEmails: e.target.value })} />
        </Field>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.autoCreateTicket}
              onChange={(e) => set({ autoCreateTicket: e.target.checked })} />
            Abrir un incidente automáticamente
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive}
              onChange={(e) => set({ isActive: e.target.checked })} />
            Evaluar este umbral en cada ciclo del monitor
          </label>
        </div>
      </form>
    </Modal>
  );
}

function fromRecord(t) {
  return {
    kpiId: t.kpi_id, name: t.name || '', conditionType: t.condition_type,
    thresholdValue: t.threshold_value ?? '', thresholdMin: t.threshold_min ?? '',
    thresholdMax: t.threshold_max ?? '', severity: t.severity,
    cooldownMinutes: t.cooldown_minutes ?? 30,
    autoCreateTicket: Boolean(t.auto_create_ticket),
    notifyEmails: t.notify_emails || '', isActive: Boolean(t.is_active),
  };
}

function toPayload(form, isRange) {
  const payload = {
    kpiId: Number(form.kpiId), name: form.name, conditionType: form.conditionType,
    severity: form.severity, cooldownMinutes: Number(form.cooldownMinutes),
    autoCreateTicket: form.autoCreateTicket, isActive: form.isActive,
  };
  if (isRange) {
    payload.thresholdMin = Number(form.thresholdMin);
    payload.thresholdMax = Number(form.thresholdMax);
  } else {
    payload.thresholdValue = Number(form.thresholdValue);
  }
  if (form.notifyEmails) payload.notifyEmails = form.notifyEmails;
  return payload;
}
