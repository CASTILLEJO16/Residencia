import { useState } from 'react';
import { Search } from 'lucide-react';
import { auditApi } from '../services/endpoints';
import { useAsync } from '../hooks/useAsync';
import PageHeader from '../components/common/PageHeader';
import Table from '../components/common/Table';
import Pagination from '../components/common/Pagination';
import { Input, Select } from '../components/common/Input';
import Field from '../components/common/Field';
import { EmptyState, ErrorState } from '../components/common/States';
import Modal from '../components/common/Modal';
import { dateTime } from '../utils/format';

export default function Audit() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ entityType: '', action: '', from: '', to: '' });
  const [detail, setDetail] = useState(null);

  const logs = useAsync(
    () => auditApi.list({ ...clean(filters), page, limit: 50 }),
    [JSON.stringify(filters), page]
  );

  const set = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };

  return (
    <>
      <PageHeader
        title="Auditoría"
        description="Cada acción que modifica algo queda registrada aquí, con quién, cuándo y desde dónde."
      />

      <div className="flex flex-wrap items-end gap-3 border-b border-rule bg-panel px-5 py-3">
        <Field label="Entidad" htmlFor="au-entity" className="w-40">
          <Select id="au-entity" value={filters.entityType}
            onChange={(e) => set({ entityType: e.target.value })}>
            <option value="">Todas</option>
            <option value="user">Usuarios</option>
            <option value="role">Roles</option>
            <option value="kpi">Indicadores</option>
            <option value="threshold">Umbrales</option>
            <option value="alert">Alertas</option>
            <option value="ticket">Incidentes</option>
            <option value="report">Reportes</option>
          </Select>
        </Field>

        <Field label="Acción" htmlFor="au-action" className="w-52">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <Input id="au-action" className="pl-8" placeholder="user.create"
              value={filters.action} onChange={(e) => set({ action: e.target.value })} />
          </div>
        </Field>

        <Field label="Desde" htmlFor="au-from" className="w-44">
          <Input id="au-from" type="date" value={filters.from}
            onChange={(e) => set({ from: e.target.value })} />
        </Field>
        <Field label="Hasta" htmlFor="au-to" className="w-44">
          <Input id="au-to" type="date" value={filters.to}
            onChange={(e) => set({ to: e.target.value })} />
        </Field>
      </div>

      <div className="p-5">
        {logs.error ? (
          <ErrorState error={logs.error} onRetry={logs.reload} />
        ) : (
          <div className="panel">
            <Table
              loading={logs.loading}
              rows={logs.data?.data}
              onRowClick={(row) => setDetail(row)}
              empty={<EmptyState title="Sin registros" message="Ajusta los filtros o el rango de fechas." />}
              columns={[
                { key: 'created_at', header: 'Cuándo', nowrap: true,
                  render: (r) => dateTime(r.created_at) },
                { key: 'username', header: 'Quién', nowrap: true,
                  render: (r) => r.username || <span className="text-ink-3">sistema</span> },
                { key: 'action', header: 'Acción', nowrap: true },
                { key: 'entity', header: 'Sobre', nowrap: true,
                  render: (r) => r.entity_type ? `${r.entity_type} ${r.entity_id ?? ''}`.trim() : '—' },
                { key: 'status_code', header: 'HTTP', align: 'right', nowrap: true,
                  render: (r) => (
                    <span className={r.status_code >= 400 ? 'text-sev-high' : ''}>
                      {r.status_code ?? '—'}
                    </span>
                  ) },
                { key: 'ip_address', header: 'Origen', nowrap: true,
                  render: (r) => r.ip_address || '—' },
              ]}
            />
            <Pagination meta={logs.data?.meta} onChange={setPage} />
          </div>
        )}
      </div>

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.action}
        description={detail ? dateTime(detail.created_at) : ''}
      >
        {detail && (
          <div className="space-y-4 text-[13px]">
            <dl className="grid grid-cols-2 gap-3">
              <Row label="Usuario" value={detail.username || 'sistema'} />
              <Row label="Entidad" value={`${detail.entity_type || '—'} ${detail.entity_id || ''}`} />
              <Row label="Petición" value={`${detail.http_method || ''} ${detail.endpoint || ''}`} />
              <Row label="Respuesta" value={detail.status_code} />
              <Row label="IP" value={detail.ip_address || '—'} />
            </dl>
            <Json label="Antes" value={detail.old_values} />
            <Json label="Después" value={detail.new_values} />
          </div>
        )}
      </Modal>
    </>
  );
}

function Row({ label, value }) {
  return (
    <div>
      <dt className="text-micro text-ink-3">{label}</dt>
      <dd className="mt-0.5 break-all">{value ?? '—'}</dd>
    </div>
  );
}

function Json({ label, value }) {
  if (!value) return null;
  let pretty = value;
  try { pretty = JSON.stringify(JSON.parse(value), null, 2); } catch { /* se muestra tal cual */ }
  return (
    <div>
      <p className="mb-1 text-micro text-ink-3">{label}</p>
      <pre className="max-h-48 overflow-auto rounded-panel border border-rule bg-[#F7F9FB] p-2.5 font-mono text-[12px] leading-relaxed">
        {pretty}
      </pre>
    </div>
  );
}

function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v != null));
}
