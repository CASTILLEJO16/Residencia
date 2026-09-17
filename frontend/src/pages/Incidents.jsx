import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { ticketApi, userApi } from '../services/endpoints';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../contexts/ToastContext';
import PageHeader from '../components/common/PageHeader';
import Button from '../components/common/Button';
import Table from '../components/common/Table';
import Pagination from '../components/common/Pagination';
import { PriorityBadge, StatusBadge } from '../components/common/Badge';
import { EmptyState, ErrorState } from '../components/common/States';
import { Input, Select } from '../components/common/Input';
import TicketForm from '../components/incidents/TicketForm';
import TicketDetail from '../components/incidents/TicketDetail';
import { relative, dateTime, isOverdue } from '../utils/format';
import { TICKET_STATUS, PRIORITY, ROLES } from '../utils/constants';

const VIEWS = [
  { key: 'all',        label: 'Todos',        params: {} },
  { key: 'mine',       label: 'Míos',         params: { mine: 'true' } },
  { key: 'unassigned', label: 'Sin asignar',  params: { unassigned: 'true' } },
  { key: 'overdue',    label: 'Vencidos',     params: { overdue: 'true' } },
];

export default function Incidents() {
  const { canEdit, hasRole } = useAuth();
  const toast = useToast();
  const [view, setView] = useState('all');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: '', priority: '', search: '' });
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const viewParams = VIEWS.find((v) => v.key === view).params;

  const tickets = useAsync(
    () => ticketApi.list({ ...viewParams, ...clean(filters), page, limit: 25 }),
    [view, filters.status, filters.priority, filters.search, page]
  );
  const summary = useAsync(() => ticketApi.summary(), []);
  const users = useAsync(
    () => hasRole(ROLES.ADMIN) ? userApi.list({ limit: 100, isActive: 'true' }) : Promise.resolve({ data: [] }),
    []
  );

  const detail = useAsync(
    () => (detailId ? ticketApi.get(detailId) : Promise.resolve(null)),
    [detailId]
  );

  const refreshAll = () => {
    tickets.reload();
    summary.reload();
    if (detailId) detail.reload();
  };

  if (tickets.error) {
    return (
      <>
        <PageHeader title="Incidentes" />
        <div className="p-5"><ErrorState error={tickets.error} onRetry={tickets.reload} /></div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Incidentes"
        description="Tickets abiertos a mano o generados por una alerta."
      >
        {canEdit && (
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            Nuevo incidente
          </Button>
        )}
      </PageHeader>

      <Counters summary={summary.data} />

      <div className="p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex rounded-panel border border-rule bg-panel">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => { setView(v.key); setPage(1); }}
                className={`px-3 py-1.5 text-[13px] first:rounded-l-panel last:rounded-r-panel
                  ${view === v.key ? 'bg-steel-soft font-medium text-steel' : 'text-ink-2 hover:text-ink'}`}
              >
                {v.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <Input
              className="w-56 pl-8"
              placeholder="Buscar por título"
              value={filters.search}
              onChange={(e) => { setFilters({ ...filters, search: e.target.value }); setPage(1); }}
              aria-label="Buscar incidentes"
            />
          </div>

          <Select className="w-40" value={filters.status} aria-label="Estado"
            onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }}>
            <option value="">Todos los estados</option>
            {Object.entries(TICKET_STATUS).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
          </Select>

          <Select className="w-40" value={filters.priority} aria-label="Prioridad"
            onChange={(e) => { setFilters({ ...filters, priority: e.target.value }); setPage(1); }}>
            <option value="">Cualquier prioridad</option>
            {Object.entries(PRIORITY).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
          </Select>
        </div>

        <div className="panel">
          <Table
            loading={tickets.loading}
            rows={tickets.data?.data}
            onRowClick={(row) => setDetailId(row.id)}
            rowAccent={(r) => r.status === 'closed' ? 'border-l-rule' : `border-l-sev-${r.priority}`}
            empty={<EmptyState
              title="Nada por aquí"
              message={view === 'all'
                ? 'Cuando una alerta con incidente automático se dispare, aparecerá en esta lista.'
                : 'Prueba con otra vista o quita los filtros.'}
              action={canEdit && view === 'all'
                ? <Button icon={Plus} onClick={() => setCreating(true)}>Crear el primero</Button>
                : null}
            />}
            columns={[
              { key: 'ticket_number', header: 'Ticket', nowrap: true,
                render: (r) => <span className="font-medium tnum">{r.ticket_number}</span> },
              { key: 'title', header: 'Asunto', render: (r) => (
                <div>
                  <p className="leading-snug">{r.title}</p>
                  {r.kpi_name && <p className="text-micro text-ink-3">alerta de {r.kpi_name}</p>}
                </div>
              ) },
              { key: 'priority', header: 'Prioridad', nowrap: true,
                render: (r) => <PriorityBadge value={r.priority} /> },
              { key: 'status', header: 'Estado', nowrap: true,
                render: (r) => <StatusBadge value={r.status} /> },
              { key: 'assigned_to_name', header: 'Responsable', nowrap: true,
                render: (r) => r.assigned_to_name || <span className="text-ink-3">sin asignar</span> },
              { key: 'due_date', header: 'Compromiso', nowrap: true, render: (r) => r.due_date
                ? <span className={isOverdue(r.due_date, r.status) ? 'text-sev-high' : ''}
                    title={dateTime(r.due_date)}>{relative(r.due_date)}</span>
                : '—' },
              { key: 'created_at', header: 'Creado', nowrap: true,
                render: (r) => <span title={dateTime(r.created_at)}>{relative(r.created_at)}</span> },
            ]}
          />
          <Pagination meta={tickets.data?.meta} onChange={setPage} />
        </div>
      </div>

      {creating && (
        <TicketForm
          open
          users={users.data?.data || []}
          onClose={() => setCreating(false)}
          onSaved={() => { toast.success('Incidente creado'); setCreating(false); refreshAll(); }}
        />
      )}

      {detailId && detail.data && (
        <TicketDetail
          open
          ticket={detail.data}
          users={users.data?.data || []}
          onClose={() => setDetailId(null)}
          onChanged={refreshAll}
        />
      )}
    </>
  );
}

function Counters({ summary }) {
  if (!summary) return <div className="h-[53px] border-b border-rule bg-panel" />;
  const items = [
    { label: 'abiertos', value: summary.open_count, accent: 'text-sev-high' },
    { label: 'en curso', value: summary.in_progress_count },
    { label: 'escalados', value: summary.escalated_count, accent: 'text-sev-critical' },
    { label: 'sin asignar', value: summary.unassigned_count },
    { label: 'vencidos', value: summary.overdue_count, accent: 'text-sev-high' },
    { label: 'cerrados en 7 días', value: summary.closed_last_7d, accent: 'text-sev-ok' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-rule bg-panel px-5 py-3">
      {items.map((item) => (
        <p key={item.label} className="text-[13px] text-ink-2">
          <span className={`font-semibold tnum ${item.value > 0 ? item.accent || 'text-ink' : 'text-ink-3'}`}>
            {item.value ?? 0}
          </span>{' '}
          {item.label}
        </p>
      ))}
    </div>
  );
}

function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v != null));
}
