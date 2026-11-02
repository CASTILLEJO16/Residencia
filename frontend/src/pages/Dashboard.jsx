import { useCallback, useState } from 'react';
import { RefreshCw, AlertTriangle, Clock, CheckCircle, TrendingUp, Users } from 'lucide-react';
import { ticketApi, alertApi } from '../services/endpoints';
import { useAsync, useInterval } from '../hooks/useAsync';
import PageHeader from '../components/common/PageHeader';
import Button from '../components/common/Button';
import { Loading, ErrorState } from '../components/common/States';
import { relative } from '../utils/format';

export default function Dashboard() {
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const summary = useAsync(() => ticketApi.summary(), []);
  const alerts = useAsync(() => alertApi.summary(), []);

  const reloadAll = useCallback(async () => {
    await Promise.all([
      summary.reload(),
      alerts.reload(),
    ]);
    setLastUpdate(new Date());
  }, [summary.reload, alerts.reload]);

  useInterval(() => { reloadAll().catch(() => {}); }, 60000);

  if (summary.loading && !summary.data) return <Loading label="Cargando el tablero" />;
  if (summary.error) return <div className="p-5"><ErrorState error={summary.error} onRetry={summary.reload} /></div>;

  const data = summary.data || {};
  const alertData = alerts.data || {};

  const metrics = [
    {
      label: 'Tickets abiertos',
      value: data.open_count || 0,
      icon: AlertTriangle,
      color: data.open_count > 0 ? 'text-sev-high' : 'text-ink-3',
      bgColor: 'bg-sev-high/10',
    },
    {
      label: 'En curso',
      value: data.in_progress_count || 0,
      icon: Clock,
      color: 'text-steel',
      bgColor: 'bg-steel/10',
    },
    {
      label: 'Escalados',
      value: data.escalated_count || 0,
      icon: TrendingUp,
      color: data.escalated_count > 0 ? 'text-sev-critical' : 'text-ink-3',
      bgColor: 'bg-sev-critical/10',
    },
    {
      label: 'Sin asignar',
      value: data.unassigned_count || 0,
      icon: Users,
      color: data.unassigned_count > 0 ? 'text-sev-medium' : 'text-ink-3',
      bgColor: 'bg-sev-medium/10',
    },
    {
      label: 'Vencidos',
      value: data.overdue_count || 0,
      icon: AlertTriangle,
      color: data.overdue_count > 0 ? 'text-sev-high' : 'text-ink-3',
      bgColor: 'bg-sev-high/10',
    },
    {
      label: 'Cerrados (7 días)',
      value: data.closed_last_7d || 0,
      icon: CheckCircle,
      color: 'text-sev-ok',
      bgColor: 'bg-sev-ok/10',
    },
  ];

  return (
    <>
      <PageHeader
        title="Tablero de Tickets"
        description={`Actualizado ${relative(lastUpdate)}`}
      >
        <Button icon={RefreshCw} onClick={() => reloadAll()}>Actualizar</Button>
      </PageHeader>

      <AlertStatus alerts={alertData} />

      <div className="p-5">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>

        <QuickActions summary={data} />
      </div>
    </>
  );
}

function MetricCard({ label, value, icon: Icon, color, bgColor }) {
  return (
    <div className="panel p-4">
      <div className={`flex items-center justify-between ${bgColor} rounded-panel p-2 mb-3`}>
        <Icon size={18} className={color} />
      </div>
      <p className={`text-2xl font-semibold tnum ${value > 0 ? color : 'text-ink-3'}`}>
        {value}
      </p>
      <p className="text-[13px] text-ink-2">{label}</p>
    </div>
  );
}

function AlertStatus({ alerts }) {
  const critical = alerts?.critical_count || 0;
  const high = alerts?.high_count || 0;
  const open = alerts?.open_count || 0;

  const tone = critical > 0 ? 'border-l-sev-critical'
    : high > 0 ? 'border-l-sev-high'
    : open > 0 ? 'border-l-sev-medium'
    : 'border-l-sev-ok';

  const message = critical > 0
    ? `${critical} alerta${critical > 1 ? 's' : ''} crítica${critical > 1 ? 's' : ''} sin resolver`
    : high > 0
      ? `${high} alerta${high > 1 ? 's' : ''} de severidad alta sin resolver`
      : open > 0
        ? `${open} alerta${open > 1 ? 's' : ''} abierta${open > 1 ? 's' : ''}`
        : 'Sin alertas activas';

  return (
    <div className={`sev-edge ${tone} flex flex-wrap items-center justify-between gap-3
      border-b border-rule bg-panel px-5 py-3`}>
      <p className="text-sm font-medium">{message}</p>
      <p className="text-[13px] text-ink-2">
        {alerts?.last_24h > 0 && `${alerts.last_24h} alertas en 24 h`}
      </p>
    </div>
  );
}

function QuickActions({ summary }) {
  const urgent = (summary?.overdue_count || 0) + (summary?.escalated_count || 0);
  
  if (urgent === 0) return null;

  return (
    <div className="mt-6 panel p-4">
      <h3 className="text-sm font-medium mb-3">Acciones prioritarias</h3>
      <div className="flex flex-wrap gap-2">
        {summary?.overdue_count > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-panel bg-sev-high/10 text-sev-high text-[13px]">
            <AlertTriangle size={14} />
            {summary.overdue_count} ticket{summary.overdue_count > 1 ? 's' : ''} vencido{summary.overdue_count > 1 ? 's' : ''}
          </span>
        )}
        {summary?.escalated_count > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-panel bg-sev-critical/10 text-sev-critical text-[13px]">
            <TrendingUp size={14} />
            {summary.escalated_count} ticket{summary.escalated_count > 1 ? 's' : ''} escalado{summary.escalated_count > 1 ? 's' : ''}
          </span>
        )}
        {summary?.unassigned_count > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-panel bg-sev-medium/10 text-sev-medium text-[13px]">
            <Users size={14} />
            {summary.unassigned_count} sin asignar
          </span>
        )}
      </div>
    </div>
  );
}
