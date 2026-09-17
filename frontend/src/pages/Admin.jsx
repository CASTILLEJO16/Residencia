import { useState } from 'react';
import { Plus, KeyRound, Unlock, Pencil, Power } from 'lucide-react';
import { userApi, roleApi } from '../services/endpoints';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../contexts/ToastContext';
import PageHeader from '../components/common/PageHeader';
import Button from '../components/common/Button';
import Table from '../components/common/Table';
import Pagination from '../components/common/Pagination';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import Field from '../components/common/Field';
import { Input, Select } from '../components/common/Input';
import { EmptyState, ErrorState } from '../components/common/States';
import { dateTime, relative } from '../utils/format';

const TABS = [{ key: 'usuarios', label: 'Usuarios' }, { key: 'roles', label: 'Roles' }];

export default function Admin() {
  const [tab, setTab] = useState('usuarios');
  return (
    <>
      <PageHeader title="Administración" description="Cuentas, permisos y acceso al sistema." />
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
      <div className="p-5">{tab === 'usuarios' ? <UserTab /> : <RoleTab />}</div>
    </>
  );
}

/* ---------------- usuarios ---------------- */

function UserTab() {
  const { user: current } = useAuth();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [toggling, setToggling] = useState(null);
  const [busy, setBusy] = useState(false);

  const users = useAsync(() => userApi.list({ page, limit: 25, search: search || undefined }), [page, search]);
  const roles = useAsync(() => roleApi.list(), []);

  const toggleStatus = async () => {
    setBusy(true);
    try {
      await userApi.setStatus(toggling.id, !toggling.is_active);
      toast.success(toggling.is_active ? 'Cuenta desactivada' : 'Cuenta activada');
      setToggling(null);
      users.reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const unlock = async (row) => {
    try {
      await userApi.unlock(row.id);
      toast.success(`Se desbloqueó a ${row.full_name}`);
      users.reload();
    } catch (err) {
      toast.error(err);
    }
  };

  if (users.error) return <ErrorState error={users.error} onRetry={users.reload} />;

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Input
          className="w-64"
          placeholder="Buscar por nombre, usuario o correo"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          aria-label="Buscar usuarios"
        />
        <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>Nuevo usuario</Button>
      </div>

      <div className="panel">
        <Table
          loading={users.loading}
          rows={users.data?.data}
          empty={<EmptyState title="Sin resultados" message="Prueba con otro término de búsqueda." />}
          columns={[
            { key: 'full_name', header: 'Nombre', render: (r) => (
              <div>
                <p className="font-medium">
                  {r.full_name}
                  {r.id === current?.id && <span className="ml-1.5 text-micro text-ink-3">tú</span>}
                </p>
                <p className="text-[13px] text-ink-2">{r.username} · {r.email}</p>
              </div>
            ) },
            { key: 'role_name', header: 'Rol', nowrap: true,
              render: (r) => r.role_name.replace('SIO_', '') },
            { key: 'last_login', header: 'Último acceso', nowrap: true,
              render: (r) => r.last_login
                ? <span title={dateTime(r.last_login)}>{relative(r.last_login)}</span>
                : <span className="text-ink-3">nunca</span> },
            { key: 'is_active', header: 'Estado', nowrap: true, render: (r) => (
              <span className="flex flex-col">
                <span className={`text-[13px] ${r.is_active ? 'text-sev-ok' : 'text-ink-3'}`}>
                  {r.is_active ? 'Activa' : 'Desactivada'}
                </span>
                {r.must_change_password && (
                  <span className="text-micro text-sev-medium">contraseña temporal</span>
                )}
              </span>
            ) },
            { key: 'actions', header: '', align: 'right', nowrap: true, render: (r) => (
              <span className="flex justify-end gap-1">
                <Button size="sm" variant="quiet" icon={Pencil} onClick={() => setEditing(r)}>Editar</Button>
                <Button size="sm" variant="quiet" icon={KeyRound} onClick={() => setResetting(r)}>
                  Contraseña
                </Button>
                <Button size="sm" variant="quiet" icon={Unlock} onClick={() => unlock(r)}>Desbloquear</Button>
                {r.id !== current?.id && (
                  <Button size="sm" variant="quiet" icon={Power} onClick={() => setToggling(r)}>
                    {r.is_active ? 'Desactivar' : 'Activar'}
                  </Button>
                )}
              </span>
            ) },
          ]}
        />
        <Pagination meta={users.data?.meta} onChange={setPage} />
      </div>

      {editing && (
        <UserForm
          user={editing.id ? editing : null}
          roles={roles.data || []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            toast.success(editing.id ? 'Usuario actualizado' : 'Usuario creado');
            setEditing(null);
            users.reload();
          }}
        />
      )}

      {resetting && (
        <ResetPasswordForm
          user={resetting}
          onClose={() => setResetting(null)}
          onSaved={() => {
            toast.success(`Contraseña restablecida para ${resetting.full_name}`);
            setResetting(null);
            users.reload();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(toggling)}
        onClose={() => setToggling(null)}
        onConfirm={toggleStatus}
        loading={busy}
        variant={toggling?.is_active ? 'danger' : 'primary'}
        confirmLabel={toggling?.is_active ? 'Desactivar' : 'Activar'}
        title={`${toggling?.is_active ? 'Desactivar' : 'Activar'} a ${toggling?.full_name}`}
        message={toggling?.is_active
          ? 'Se cerrarán sus sesiones abiertas de inmediato. La cuenta no se borra: su historial de incidentes y auditoría se conserva.'
          : 'Volverá a poder iniciar sesión con su contraseña actual.'}
      />
    </>
  );
}

function UserForm({ user, roles, onClose, onSaved }) {
  const [form, setForm] = useState({
    username: user?.username || '',
    email: user?.email || '',
    fullName: user?.full_name || '',
    roleId: user?.role_id || roles[0]?.id || '',
    password: '',
  });
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setErrors([]);
    try {
      if (user) {
        await userApi.update(user.id, {
          email: form.email, fullName: form.fullName, roleId: Number(form.roleId),
        });
      } else {
        await userApi.create({
          username: form.username, email: form.email, fullName: form.fullName,
          roleId: Number(form.roleId), password: form.password, mustChangePassword: true,
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
      title={user ? `Editar ${user.full_name}` : 'Nuevo usuario'}
      description={user ? undefined : 'La persona deberá cambiar la contraseña en su primer acceso.'}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            {user ? 'Guardar cambios' : 'Crear usuario'}
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

        {!user && (
          <Field label="Usuario" htmlFor="u-username" required hint="No se puede cambiar después.">
            <Input id="u-username" required minLength={3} value={form.username}
              onChange={(e) => set({ username: e.target.value })} />
          </Field>
        )}

        <Field label="Nombre completo" htmlFor="u-name" required>
          <Input id="u-name" required value={form.fullName}
            onChange={(e) => set({ fullName: e.target.value })} />
        </Field>

        <Field label="Correo" htmlFor="u-email" required>
          <Input id="u-email" type="email" required value={form.email}
            onChange={(e) => set({ email: e.target.value })} />
        </Field>

        <Field label="Rol" htmlFor="u-role" required>
          <Select id="u-role" value={form.roleId} onChange={(e) => set({ roleId: e.target.value })}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name.replace('SIO_', '')} — {r.description}</option>
            ))}
          </Select>
        </Field>

        {!user && (
          <Field label="Contraseña temporal" htmlFor="u-pass" required
            hint="10 caracteres o más, con mayúscula, minúscula, número y símbolo.">
            <Input id="u-pass" type="password" required minLength={10} value={form.password}
              onChange={(e) => set({ password: e.target.value })} />
          </Field>
        )}
      </form>
    </Modal>
  );
}

function ResetPasswordForm({ user, onClose, onSaved }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await userApi.resetPassword(user.id, password);
      onSaved();
    } catch (err) {
      setError(err.details?.map((d) => d.message).join('; ') || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Nueva contraseña para ${user.full_name}`}
      description="Se cerrarán sus sesiones y deberá cambiarla al entrar."
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="primary" onClick={submit} loading={saving} disabled={password.length < 10}>
            Restablecer
          </Button>
        </>
      }
    >
      <Field label="Contraseña temporal" htmlFor="r-pass" error={error}
        hint="10 caracteres o más, con mayúscula, minúscula, número y símbolo.">
        <Input id="r-pass" type="password" autoFocus value={password}
          onChange={(e) => setPassword(e.target.value)} />
      </Field>
    </Modal>
  );
}

/* ---------------- roles ---------------- */

function RoleTab() {
  const toast = useToast();
  const roles = useAsync(() => roleApi.list(), []);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });

  const openForm = (role) => {
    setEditing(role);
    setForm({ name: role?.name || '', description: role?.description || '' });
  };

  const submit = async () => {
    setSaving(true);
    try {
      if (editing?.id) await roleApi.update(editing.id, form);
      else await roleApi.create(form);
      toast.success(editing?.id ? 'Rol actualizado' : 'Rol creado');
      setEditing(null);
      roles.reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (roles.error) return <ErrorState error={roles.error} onRetry={roles.reload} />;

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button variant="primary" icon={Plus} onClick={() => openForm(null)}>Nuevo rol</Button>
      </div>

      <div className="panel">
        <Table
          loading={roles.loading}
          rows={roles.data}
          empty={<EmptyState title="Sin roles" message="Algo salió mal: deberían existir los cuatro roles base." />}
          columns={[
            { key: 'name', header: 'Rol', render: (r) => (
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="text-[13px] text-ink-2">{r.description}</p>
              </div>
            ) },
            { key: 'user_count', header: 'Personas', align: 'right', nowrap: true },
            { key: 'is_system', header: '', nowrap: true, render: (r) => r.is_system && (
              <span className="text-micro text-ink-3">rol del sistema</span>
            ) },
            { key: 'actions', header: '', align: 'right', nowrap: true, render: (r) => !r.is_system && (
              <Button size="sm" variant="quiet" icon={Pencil} onClick={() => openForm(r)}>Editar</Button>
            ) },
          ]}
        />
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="sm"
        title={editing?.id ? `Editar ${editing.name}` : 'Nuevo rol'}
        description="Los permisos de cada rol se definen en el código; aquí solo se nombra."
        footer={
          <>
            <Button onClick={() => setEditing(null)} disabled={saving}>Cancelar</Button>
            <Button variant="primary" onClick={submit} loading={saving} disabled={form.name.length < 3}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nombre" htmlFor="role-name" required hint="Solo letras, números y guion bajo.">
            <Input id="role-name" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Descripción" htmlFor="role-desc">
            <Input id="role-desc" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
