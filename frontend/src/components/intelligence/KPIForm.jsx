import { useState } from 'react';
import { Play, ShieldCheck, ShieldAlert } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Field from '../common/Field';
import { Input, Select, CodeArea } from '../common/Input';
import { kpiApi } from '../../services/endpoints';
import { WIDGET_TYPES } from '../../utils/constants';
import { cell } from '../../utils/format';

const EMPTY = {
  name: '', description: '', sqlQuery: '', dataSource: '',
  refreshInterval: 300, maxRows: 1000, timeoutSeconds: 15,
  widgetType: 'number', valueColumn: '', labelColumn: '', isActive: true,
};

export default function KPIForm({ open, kpi, onClose, onSaved }) {
  const [form, setForm] = useState(() => (kpi ? fromRecord(kpi) : EMPTY));
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [check, setCheck] = useState(null);
  const [sample, setSample] = useState(null);
  const [running, setRunning] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const validate = async () => {
    const result = await kpiApi.validate(form.sqlQuery);
    setCheck(result);
    return result.valid;
  };

  /** Probar ejecuta contra la conexión de solo lectura y no guarda nada. */
  const runPreview = async () => {
    setRunning(true);
    setSample(null);
    try {
      if (!(await validate())) return;
      const result = await kpiApi.preview(form.sqlQuery);
      setSample(result);
      // Las columnas devueltas ayudan a elegir el eje y el valor.
      if (!form.valueColumn && result.columns?.length) {
        const numeric = result.columns.find((c) => c.numeric);
        const text = result.columns.find((c) => !c.numeric);
        set({
          valueColumn: numeric?.name || '',
          labelColumn: text?.name || '',
        });
      }
    } catch (err) {
      setCheck({ valid: false, problems: [err.message] });
    } finally {
      setRunning(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setErrors([]);
    try {
      const payload = toPayload(form);
      const saved = kpi ? await kpiApi.update(kpi.id, payload) : await kpiApi.create(payload);
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
      size="xl"
      title={kpi ? `Editar ${kpi.name}` : 'Nuevo indicador'}
      description="La consulta se ejecuta con un usuario de solo lectura sobre la base de origen."
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            {kpi ? 'Guardar cambios' : 'Crear indicador'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {errors.length > 0 && (
          <div className="panel sev-edge border-l-sev-critical p-3">
            <p className="text-[13px] font-medium">No se pudo guardar</p>
            <ul className="mt-1 space-y-0.5 text-[13px] text-ink-2">
              {errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nombre" htmlFor="kpi-name" required>
            <Input id="kpi-name" required value={form.name}
              onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Origen de datos" htmlFor="kpi-source"
            hint="Etiqueta libre para saber de dónde salen las cifras">
            <Input id="kpi-source" value={form.dataSource}
              onChange={(e) => set({ dataSource: e.target.value })} />
          </Field>
        </div>

        <Field label="Descripción" htmlFor="kpi-desc">
          <Input id="kpi-desc" value={form.description}
            onChange={(e) => set({ description: e.target.value })} />
        </Field>

        <Field
          label="Consulta"
          htmlFor="kpi-sql"
          required
          hint="Solo un SELECT. Sin punto y coma intermedio, sin comentarios y sin acceso a las tablas del sistema."
        >
          <CodeArea
            id="kpi-sql" rows={7} required
            placeholder="SELECT CONVERT(date, fecha) AS dia, SUM(total) AS ventas&#10;FROM ventas&#10;WHERE fecha >= DATEADD(DAY, -30, GETDATE())&#10;GROUP BY CONVERT(date, fecha)&#10;ORDER BY dia"
            value={form.sqlQuery}
            onChange={(e) => { set({ sqlQuery: e.target.value }); setCheck(null); }}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button icon={Play} onClick={runPreview} loading={running} type="button">
            Probar consulta
          </Button>
          {check && (
            <span className={`flex items-center gap-1.5 text-[13px] ${
              check.valid ? 'text-sev-ok' : 'text-sev-critical'}`}>
              {check.valid ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
              {check.valid ? 'La consulta pasa las validaciones' : check.problems.join(' · ')}
            </span>
          )}
        </div>

        {sample && <SamplePreview sample={sample} />}

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Tipo de gráfica" htmlFor="kpi-widget" required>
            <Select id="kpi-widget" value={form.widgetType}
              onChange={(e) => set({ widgetType: e.target.value })}>
              {WIDGET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Columna del valor" htmlFor="kpi-value"
            hint="La que se compara contra los umbrales">
            <ColumnPicker id="kpi-value" columns={sample?.columns} value={form.valueColumn}
              onChange={(v) => set({ valueColumn: v })} />
          </Field>
          <Field label="Columna de la etiqueta" htmlFor="kpi-label"
            hint="El eje horizontal o el nombre de cada porción">
            <ColumnPicker id="kpi-label" columns={sample?.columns} value={form.labelColumn}
              onChange={(v) => set({ labelColumn: v })} />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Cada cuántos segundos se refresca" htmlFor="kpi-interval">
            <Input id="kpi-interval" type="number" min={30} max={86400} value={form.refreshInterval}
              onChange={(e) => set({ refreshInterval: Number(e.target.value) })} />
          </Field>
          <Field label="Máximo de filas" htmlFor="kpi-rows">
            <Input id="kpi-rows" type="number" min={1} max={10000} value={form.maxRows}
              onChange={(e) => set({ maxRows: Number(e.target.value) })} />
          </Field>
          <Field label="Tiempo límite en segundos" htmlFor="kpi-timeout">
            <Input id="kpi-timeout" type="number" min={1} max={120} value={form.timeoutSeconds}
              onChange={(e) => set({ timeoutSeconds: Number(e.target.value) })} />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isActive}
            onChange={(e) => set({ isActive: e.target.checked })} />
          Mostrar en el tablero y evaluar sus umbrales
        </label>
      </form>
    </Modal>
  );
}

function ColumnPicker({ id, columns, value, onChange }) {
  if (!columns?.length) {
    return <Input id={id} value={value} placeholder="Prueba la consulta primero"
      onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Automático</option>
      {columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
    </Select>
  );
}

function SamplePreview({ sample }) {
  const columns = sample.columns.map((c) => c.name);
  return (
    <div className="panel">
      <p className="border-b border-rule px-3 py-2 text-[13px] text-ink-2 tnum">
        {sample.rowCount} fila(s) en {sample.durationMs} ms
        {sample.rows.length < sample.rowCount && ' · se muestran las primeras 50'}
      </p>
      <div className="max-h-56 overflow-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 bg-paper">
            <tr className="border-b border-rule text-left">
              {columns.map((name) => (
                <th key={name} className="whitespace-nowrap px-2.5 py-1.5 font-semibold text-ink-2">{name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sample.rows.map((row, i) => (
              <tr key={i} className="border-b border-rule/60 last:border-0">
                {columns.map((name) => (
                  <td key={name} className="whitespace-nowrap px-2.5 py-1.5 tnum">{cell(row[name])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function fromRecord(kpi) {
  return {
    name: kpi.name || '', description: kpi.description || '', sqlQuery: kpi.sql_query || '',
    dataSource: kpi.data_source || '', refreshInterval: kpi.refresh_interval || 300,
    maxRows: kpi.max_rows || 1000, timeoutSeconds: kpi.timeout_seconds || 15,
    widgetType: kpi.widget_type || 'number', valueColumn: kpi.value_column || '',
    labelColumn: kpi.label_column || '', isActive: Boolean(kpi.is_active),
  };
}

function toPayload(form) {
  const payload = { ...form };
  for (const key of ['description', 'dataSource', 'valueColumn', 'labelColumn']) {
    if (!payload[key]) delete payload[key];
  }
  return payload;
}
