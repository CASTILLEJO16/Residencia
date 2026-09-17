import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Play, Pencil, Trash2, Check } from 'lucide-react';
import { kpiApi, thresholdApi, alertApi } from '../services/endpoints';
import { useAsync, useInterval } from '../hooks/useAsync';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../contexts/ToastContext';
import PageHeader from '../components/common/PageHeader';
import Button from '../components/common/Button';
import Table from '../components/common/Table';
import Pagination from '../components/common/Pagination';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { SeverityBadge, StatusBadge } from '../components/common/Badge';
import { EmptyState, ErrorState } from '../components/common/States';
import { Select } from '../components/common/Input';
import KPIForm from '../components/intelligence/KPIForm';
import ThresholdForm from '../components/intelligence/ThresholdForm';
import { dateTime, relative, number } from '../utils/format';
import { CONDITIONS, WIDGET_TYPES } from '../utils/constants';

const TABS = [
  { key: 'kpis', label: 'Indicadores' },
  { key: 'umbrales', label: 'Umbrales' },
  { key: 'alertas', label: 'Alertas' },
];

export default function Intelligence() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'kpis';

  return (
    <>
      <PageHeader
        title="Inteligencia"
        description="Define qué se mide, cuándo se considera un problema y qué alertas se generaron."
      />
      <div className="border-b border-rule bg-panel px-5">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setParams({ tab: t.key })}
              className={`border-b-2 px-3 py-2.5 text-sm ${
                tab === t.key
                  ? 'border-b-steel font-medium text-steel'
                  : 'border-b-transparent text-ink-2 hover:text-ink'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        {tab === 'kpis' && <KpiTab />}
        {tab === 'umbrales' && <ThresholdTab />}
        {tab === 'alertas' && <AlertTab />}
      </div>
    </>
  );
}

/* ---------------- indicadores ---------------- */

function KpiTab() {
  const { canEdit, isAdmin } = useAuth();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [removing, setRemoving] = useState(false);

  const kpis = useAsync(() => kpiApi.list({ page, limit: 20 }), [page]);

  const confirmDelete = async () => {
    setRemoving(true);
    try {
      await kpiApi.remove(deleting.id);
      toast.success(`Se eliminó ${deleting.name}`);
      setDeleting(null);
      kpis.reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setRemoving(false);
    }
  };

  if (kpis.error) return <ErrorState error={kpis.error} onRetry={kpis.reload} />;

  return (
    <>
      <div className="mb-3 flex justify-end">
        {canEdit && (
          <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>
            Nuevo indicador
          </Button>
        )}
      </div>

      <div className="panel">
        <Table
          loading={kpis.loading}
          rows={kpis.data?.data}
          empty={<EmptyState
            title="Sin indicadores"
            message="Crea el primero para que empiece a aparecer en el tablero."
          />}
          columns={[
            { key: 'name', header: 'Indicador', render: (r) => (
              <div>
                <p className="font-medium">{r.name}</p>
                {r.description && <p className="text-[13px] text-ink-2">{r.description}</p>}
              </div>
            ) },
            { key: 'widget_type', header: 'Gráfica', nowrap: true, render: (r) =>
              WIDGET_TYPES.find((t) => t.value === r.widget_type)?.label || r.widget_type },
            { key: 'refresh_interval', header: 'Refresco', align: 'right', nowrap: true,
              render: (r) => `${r.refresh_interval} s` },
            { key: 'data_source', header: 'Origen', render: (r) => r.data_source || '—' },
            { key: 'is_active', header: 'Estado', nowrap: true, render: (r) => (
              <span className={`text-[13px] ${r.is_active ? 'text-sev-ok' : 'text-ink-3'}`}>
                {r.is_active ? 'Activo' : 'Pausado'}
              </span>
            ) },
            { key: 'actions', header: '', align: 'right', nowrap: true, render: (r) => canEdit && (
              <span className="flex justify-end gap-1">
                <Button size="sm" variant="quiet" icon={Pencil} onClick={() => setEditing(r)}>
                  Editar
                </Button>
                {isAdmin && (
                  <Button size="sm" variant="quiet" icon={Trash2} onClick={() => setDeleting(r)}>
                    Eliminar
                  </Button>
                )}
              </span>
            ) },
          ]}
        />
        <Pagination meta={kpis.data?.meta} onChange={setPage} />
      </div>

      {editing && (
        <KPIForm
          open
          kpi={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            toast.success(editing.id ? 'Indicador actualizado' : 'Indicador creado');
            setEditing(null);
            kpis.reload();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={removing}
        variant="danger"
        confirmLabel="Eliminar"
        title={`Eliminar ${deleting?.name}`}
        message="Se borrará el indicador junto con su histórico. Si solo quieres dejar de verlo en el tablero, edítalo y quítale la marca de activo."
      />
    </>
  );
}

/* ---------------- umbrales ---------------- */

function ThresholdTab() {
  const { canEdit } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [testing, setTesting] = useState(null);

  const thresholds = useAsync(() => thresholdApi.list(), []);
  const kpis = useAsync(() => kpiApi.list({ limit: 100 }), []);

  const runTest = async (row) => {
    setTesting(row.id);
    try {
      const result = await thresholdApi.test(row.id);
      if (result.breached) toast.error(result.message);
      else toast.success(`${result.message} (valor actual: ${number(result.currentValue)})`);
    } catch (err) {
      toast.error(err);
    } finally {
      setTesting(null);
    }
  };

  const confirmDelete = async () => {
    setRemoving(true);
    try {
      await thresholdApi.remove(deleting.id);
      toast.success('Umbral eliminado');
      setDeleting(null);
      thresholds.reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setRemoving(false);
    }
  };

  if (thresholds.error) return <ErrorState error={thresholds.error} onRetry={thresholds.reload} />;

  return (
    <>
      <div className="mb-3 flex justify-end">
        {canEdit && (
          <Button variant="primary" icon={Plus} onClick={() => setEditing({})}
            disabled={!kpis.data?.data?.length}>
            Nuevo umbral
          </Button>
        )}
      </div>

      <div className="panel">
        <Table
          loading={thresholds.loading}
          rows={thresholds.data}
          rowAccent={(r) => r.is_active ? `border-l-sev-${r.severity}` : 'border-l-rule'}
          empty={<EmptyState
            title="Sin umbrales"
            message="Un umbral convierte un número en una alerta. Define cuándo un indicador se considera fuera de lo normal."
          />}
          columns={[
            { key: 'name', header: 'Umbral', render: (r) => (
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="text-[13px] text-ink-2">{r.kpi_name}</p>
              </div>
            ) },
            { key: 'condition', header: 'Condición', render: (r) => (
              <span className="text-[13px] tnum">
                {CONDITIONS.find((c) => c.value === r.condition_type)?.label}{' '}
                {['between', 'outside'].includes(r.condition_type)
                  ? `${number(r.threshold_min)} – ${number(r.threshold_max)}`
                  : number(r.threshold_value)}
              </span>
            ) },
            { key: 'severity', header: 'Severidad', nowrap: true,
              render: (r) => <SeverityBadge value={r.severity} /> },
            { key: 'cooldown_minutes', header: 'Espera', align: 'right', nowrap: true,
              render: (r) => `${r.cooldown_minutes} min` },
            { key: 'last_triggered_at', header: 'Última alerta', nowrap: true,
              render: (r) => r.last_triggered_at ? relative(r.last_triggered_at) : 'Nunca' },
            { key: 'flags', header: '', render: (r) => (
              <span className="flex flex-col gap-0.5 text-micro text-ink-3">
                {Boolean(r.auto_create_ticket) && <span>abre incidente</span>}
                {r.notify_emails && <span>notifica por correo</span>}
                {!r.is_active && <span className="text-ink-3">pausado</span>}
              </span>
            ) },
            { key: 'actions', header: '', align: 'right', nowrap: true, render: (r) => canEdit && (
              <span className="flex justify-end gap-1">
                <Button size="sm" variant="quiet" icon={Play}
                  loading={testing === r.id} onClick={() => runTest(r)}>
                  Probar
                </Button>
                <Button size="sm" variant="quiet" icon={Pencil} onClick={() => setEditing(r)}>
                  Editar
                </Button>
                <Button size="sm" variant="quiet" icon={Trash2} onClick={() => setDeleting(r)}>
                  Eliminar
                </Button>
              </span>
            ) },
          ]}
        />
      </div>

      {editing && (
        <ThresholdForm
          open
          threshold={editing.id ? editing : null}
          kpis={kpis.data?.data || []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            toast.success(editing.id ? 'Umbral actualizado' : 'Umbral creado');
            setEditing(null);
            thresholds.reload();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={removing}
        variant="danger"
        confirmLabel="Eliminar"
        title={`Eliminar ${deleting?.name}`}
        message="Si el umbral ya generó alertas no podrá eliminarse; en ese caso desactívalo para que deje de evaluarse."
      />
    </>
  );
}

/* ---------------- alertas ---------------- */

function AlertTab() {
  const { canEdit } = useAuth();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: 'open', severity: '' });
  const [acting, setActing] = useState(null);

  const alerts = useAsync(
    () => alertApi.list({ ...clean(filters), page, limit: 25 }),
    [filters.status, filters.severity, page]
  );

  useInterval(() => alerts.reload().catch(() => {}), 45000);

  const act = async (row, action) => {
    setActing(row.id);
    try {
      await (action === 'ack' ? alertApi.acknowledge(row.id) : alertApi.resolve(row.id));
      toast.success(action === 'ack' ? 'Alerta tomada' : 'Alerta resuelta');
      alerts.reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setActing(null);
    }
  };

  if (alerts.error) return <ErrorState error={alerts.error} onRetry={alerts.reload} />;

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <Select
          className="w-44"
          value={filters.status}
          onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }}
          aria-label="Estado"
        >
          <option value="">Todos los estados</option>
          <option value="open">Abiertas</option>
          <option value="acknowledged">Atendidas</option>
          <option value="resolved">Resueltas</option>
        </Select>
        <Select
          className="w-44"
          value={filters.severity}
          onChange={(e) => { setFilters({ ...filters, severity: e.target.value }); setPage(1); }}
          aria-label="Severidad"
        >
          <option value="">Cualquier severidad</option>
          <option value="critical">Crítica</option>
          <option value="high">Alta</option>
          <option value="medium">Media</option>
          <option value="low">Baja</option>
        </Select>
      </div>

      <div className="panel">
        <Table
          loading={alerts.loading}
          rows={alerts.data?.data}
          rowAccent={(r) => r.status === 'resolved' ? 'border-l-rule' : `border-l-sev-${r.severity}`}
          empty={<EmptyState
            title="Ninguna alerta con esos filtros"
            message="Los indicadores están dentro de sus umbrales, o no hay umbrales definidos todavía."
          />}
          columns={[
            { key: 'severity', header: 'Severidad', nowrap: true,
              render: (r) => <SeverityBadge value={r.severity} /> },
            { key: 'message', header: 'Qué pasó', render: (r) => (
              <div>
                <p className="leading-snug">{r.message}</p>
                <p className="mt-0.5 text-micro text-ink-3">
                  {r.kpi_name} · {r.threshold_name}
                  {r.occurrence_count > 1 && ` · se repitió ${r.occurrence_count} veces`}
                </p>
              </div>
            ) },
            { key: 'triggered_at', header: 'Detectada', nowrap: true,
              render: (r) => <span title={dateTime(r.triggered_at)}>{relative(r.triggered_at)}</span> },
            { key: 'status', header: 'Estado', nowrap: true,
              render: (r) => <StatusBadge value={r.status} kind="alert" /> },
            { key: 'actions', header: '', align: 'right', nowrap: true, render: (r) => canEdit && (
              <span className="flex justify-end gap-1">
                {r.status === 'open' && (
                  <Button size="sm" variant="quiet" icon={Check}
                    loading={acting === r.id} onClick={() => act(r, 'ack')}>
                    Tomar
                  </Button>
                )}
                {r.status !== 'resolved' && (
                  <Button size="sm" variant="quiet"
                    loading={acting === r.id} onClick={() => act(r, 'resolve')}>
                    Resolver
                  </Button>
                )}
              </span>
            ) },
          ]}
        />
        <Pagination meta={alerts.data?.meta} onChange={setPage} />
      </div>
    </>
  );
}

function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v != null));
}
