import { useState } from 'react';
import { LogOut, Activity, Settings as SettingsIcon } from 'lucide-react';
import { authApi, alertApi, configApi } from '../services/endpoints';
import { useAuth } from '../hooks/useAuth';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../contexts/ToastContext';
import PageHeader from '../components/common/PageHeader';
import Button from '../components/common/Button';
import Field from '../components/common/Field';
import { Input, Select, Textarea } from '../components/common/Input';
import Table from '../components/common/Table';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { relative } from '../utils/format';
import { ROLES } from '../utils/constants';

const TABS = [
  { key: 'cuenta', label: 'Mi cuenta' },
  { key: 'sistema', label: 'Configuración del sistema' },
];

export default function Settings() {
  const { user, hasRole, changePassword } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('cuenta');
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);

  const monitor = useAsync(
    () => (hasRole(ROLES.ADMIN, ROLES.ANALISTA) ? alertApi.monitorStatus() : Promise.resolve(null)),
    []
  );

  const submitPassword = async (event) => {
    event.preventDefault();
    if (form.next !== form.confirm) { toast.error('Las contraseñas no coinciden'); return; }
    setSaving(true);
    try {
      await changePassword(form.current, form.next);
    } catch (err) {
      toast.error(err);
      setSaving(false);
    }
  };

  const closeAllSessions = async () => {
    try {
      await authApi.logoutAll();
      toast.success('Se cerraron todas tus sesiones');
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <>
      <PageHeader title="Ajustes" description="Tu cuenta y la configuración del sistema." />

      <div className="border-b border-rule bg-panel px-5">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`border-b-2 px-3 py-2.5 text-sm ${
                tab === t.key ? 'border-b-steel font-medium text-steel'
                  : 'border-b-transparent text-ink-2 hover:text-ink'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        {tab === 'cuenta' ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="panel">
              <h2 className="border-b border-rule px-4 py-3 text-sm font-semibold">Tu cuenta</h2>
              <dl className="space-y-3 px-4 py-4 text-[13px]">
                <Row label="Nombre" value={user?.fullName} />
                <Row label="Usuario" value={user?.username} />
                <Row label="Correo" value={user?.email} />
                <Row label="Rol" value={user?.role?.replace('SIO_', '')} />
              </dl>
              <div className="border-t border-rule px-4 py-3">
                <Button size="sm" icon={LogOut} onClick={closeAllSessions}>
                  Cerrar mis sesiones en otros dispositivos
                </Button>
              </div>
            </section>

            <section className="panel">
              <h2 className="border-b border-rule px-4 py-3 text-sm font-semibold">Cambiar contraseña</h2>
              <form onSubmit={submitPassword} className="space-y-4 px-4 py-4">
                <Field label="Contraseña actual" htmlFor="s-current">
                  <Input id="s-current" type="password" required value={form.current}
                    onChange={(e) => setForm({ ...form, current: e.target.value })} />
                </Field>
                <Field label="Contraseña nueva" htmlFor="s-next"
                  hint="10 caracteres o más, con mayúscula, minúscula, número y símbolo.">
                  <Input id="s-next" type="password" required minLength={10} value={form.next}
                    onChange={(e) => setForm({ ...form, next: e.target.value })} />
                </Field>
                <Field label="Repítela" htmlFor="s-confirm">
                  <Input id="s-confirm" type="password" required value={form.confirm}
                    onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
                </Field>
                <p className="text-[13px] text-ink-2">
                  Al guardar se cerrarán todas tus sesiones y tendrás que entrar de nuevo.
                </p>
                <Button type="submit" variant="primary" loading={saving}>Guardar contraseña</Button>
              </form>
            </section>

            {monitor.data && (
              <section className="panel lg:col-span-2">
                <h2 className="flex items-center gap-2 border-b border-rule px-4 py-3 text-sm font-semibold">
                  <Activity size={15} className={monitor.data.enabled ? 'text-sev-ok' : 'text-ink-3'} />
                  Monitor de umbrales
                </h2>
                <dl className="grid gap-3 px-4 py-4 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
                  <Row label="Estado" value={monitor.data.enabled ? 'Activo' : 'Detenido'} />
                  <Row label="Programación" value={monitor.data.cron} />
                  <Row label="Último ciclo" value={monitor.data.lastRun
                    ? relative(monitor.data.lastRun.at) : 'Todavía no corre'} />
                  <Row label="Resultado" value={monitor.data.lastRun
                    ? `${monitor.data.lastRun.kpis} KPI · ${monitor.data.lastRun.triggered} alertas · ${monitor.data.lastRun.durationMs} ms`
                    : '—'} />
                </dl>
              </section>
            )}
          </div>
        ) : (
          <SystemConfigTab />
        )}
      </div>
    </>
  );
}

function Row({ label, value }) {
  return (
    <div>
      <dt className="text-micro text-ink-3">{label}</dt>
      <dd className="mt-0.5">{value || '—'}</dd>
    </div>
  );
}

/* ---------------- configuración del sistema ---------------- */

function SystemConfigTab() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const configs = useAsync(() => configApi.list(), []);

  if (!hasRole(ROLES.ADMIN)) {
    return (
      <div className="panel p-8 text-center">
        <SettingsIcon size={48} className="mx-auto mb-3 text-ink-3" />
        <p className="text-ink-2">Solo los administradores pueden acceder a esta sección.</p>
      </div>
    );
  }

  const handleDelete = async () => {
    setBusy(true);
    try {
      await configApi.remove(deleting.id);
      toast.success('Configuración eliminada');
      setDeleting(null);
      configs.reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  if (configs.error) return <div className="panel p-8 text-center text-sev-critical">{configs.error.message}</div>;

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[13px] text-ink-2">
          Estas configuraciones controlan el comportamiento del sistema. Modifícalas con cuidado.
        </p>
        <Button variant="primary" icon={SettingsIcon} onClick={() => setCreating(true)}>
          Nueva configuración
        </Button>
      </div>

      <div className="panel">
        <Table
          loading={configs.loading}
          rows={configs.data}
          empty={<div className="p-8 text-center text-ink-2">No hay configuraciones definidas.</div>}
          columns={[
            { key: 'key_name', header: 'Clave', nowrap: true, render: (r) => (
              <code className="text-[13px] bg-surface px-1.5 py-0.5 rounded">{r.key_name}</code>
            ) },
            { key: 'value', header: 'Valor', render: (r) => (
              <div className="max-w-xs truncate">
                {r.is_secret ? (
                  <span className="text-ink-3">••••••••</span>
                ) : r.value_type === 'bool' ? (
                  <span className={r.value === 'true' ? 'text-sev-ok' : 'text-ink-3'}>
                    {r.value === 'true' ? 'Sí' : 'No'}
                  </span>
                ) : (
                  <span className="text-[13px]">{r.value || '<vacío>'}</span>
                )}
              </div>
            ) },
            { key: 'value_type', header: 'Tipo', nowrap: true, render: (r) => (
              <span className="text-[13px] text-ink-2">{r.value_type}</span>
            ) },
            { key: 'description', header: 'Descripción', render: (r) => (
              <span className="text-[13px] text-ink-2">{r.description || '—'}</span>
            ) },
            { key: 'updated_at', header: 'Actualizado', nowrap: true, render: (r) => (
              <span className="text-[13px] text-ink-2" title={r.updated_at}>
                {relative(r.updated_at)}
              </span>
            ) },
            { key: 'actions', header: '', align: 'right', nowrap: true, render: (r) => (
              <span className="flex justify-end gap-1">
                <Button size="sm" variant="quiet" onClick={() => setEditing(r)}>Editar</Button>
                <Button size="sm" variant="quiet" onClick={() => setDeleting(r)}>Eliminar</Button>
              </span>
            ) },
          ]}
        />
      </div>

      {creating && (
        <ConfigForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            toast.success('Configuración creada');
            setCreating(false);
            configs.reload();
          }}
        />
      )}

      {editing && (
        <ConfigForm
          config={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            toast.success('Configuración actualizada');
            setEditing(null);
            configs.reload();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        loading={busy}
        variant="danger"
        confirmLabel="Eliminar"
        title={`Eliminar ${deleting?.key_name}`}
        message="Esta acción no se puede deshacer. ¿Estás seguro de que quieres eliminar esta configuración?"
      />
    </>
  );
}

function ConfigForm({ config, onClose, onSaved }) {
  const [form, setForm] = useState({
    keyName: config?.key_name || '',
    value: config?.is_secret ? '' : (config?.value || ''),
    valueType: config?.value_type || 'string',
    description: config?.description || '',
    isSecret: config?.is_secret || false,
  });
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setErrors([]);
    try {
      if (config) {
        await configApi.update(config.id, {
          value: form.value,
          description: form.description,
        });
      } else {
        await configApi.create({
          keyName: form.keyName,
          value: form.value,
          valueType: form.valueType,
          description: form.description,
          isSecret: form.isSecret,
        });
      }
      onSaved();
    } catch (err) {
      setErrors(err.details?.map((d) => `${d.field}: ${d.message}`) || [err.message]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={config ? `Editar ${config.key_name}` : 'Nueva configuración'}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            {config ? 'Guardar cambios' : 'Crear configuración'}
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

        {!config && (
          <>
            <Field label="Clave" htmlFor="c-key" required hint="Solo minúsculas, números y guiones bajos.">
              <Input
                id="c-key"
                required
                value={form.keyName}
                onChange={(e) => set({ keyName: e.target.value })}
                placeholder="ejemplo: monitor_interval"
              />
            </Field>

            <Field label="Tipo de valor" htmlFor="c-type" required>
              <Select
                id="c-type"
                required
                value={form.valueType}
                onChange={(e) => set({ valueType: e.target.value })}
              >
                <option value="string">Texto</option>
                <option value="int">Número entero</option>
                <option value="bool">Booleano (verdadero/falso)</option>
                <option value="json">JSON</option>
              </Select>
            </Field>

            <Field label="¿Es secreto?" htmlFor="c-secret" hint="Los valores secretos se ocultan en la interfaz.">
              <Select
                id="c-secret"
                value={form.isSecret ? 'true' : 'false'}
                onChange={(e) => set({ isSecret: e.target.value === 'true' })}
              >
                <option value="false">No</option>
                <option value="true">Sí</option>
              </Select>
            </Field>
          </>
        )}

        <Field label="Valor" htmlFor="c-value" required={!config?.is_secret}>
          {form.valueType === 'bool' && !config ? (
            <Select
              id="c-value"
              required
              value={form.value}
              onChange={(e) => set({ value: e.target.value })}
            >
              <option value="">Seleccionar...</option>
              <option value="true">Verdadero</option>
              <option value="false">Falso</option>
            </Select>
          ) : form.valueType === 'json' || form.value?.length > 100 ? (
            <Textarea
              id="c-value"
              required={!config?.is_secret}
              value={form.value}
              onChange={(e) => set({ value: e.target.value })}
              placeholder={form.valueType === 'json' ? '{"clave": "valor"}' : 'Valor de la configuración'}
              rows={4}
            />
          ) : (
            <Input
              id="c-value"
              type={config?.is_secret ? 'password' : 'text'}
              required={!config?.is_secret}
              value={form.value}
              onChange={(e) => set({ value: e.target.value })}
              placeholder={config?.is_secret ? 'Nuevo valor secreto' : 'Valor de la configuración'}
            />
          )}
        </Field>

        <Field label="Descripción" htmlFor="c-desc">
          <Input
            id="c-desc"
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Descripción opcional de esta configuración"
          />
        </Field>
      </form>
    </Modal>
  );
}
