import { useCallback, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { kpiApi, alertApi } from '../services/endpoints';
import { useAsync, useInterval } from '../hooks/useAsync';
import KPIWidget from '../components/dashboard/KPIWidget';
import PageHeader from '../components/common/PageHeader';
import Button from '../components/common/Button';
import { Loading, ErrorState, EmptyState } from '../components/common/States';
import { relative } from '../utils/format';

export default function Dashboard() {
  const [refreshingId, setRefreshingId] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const board = useAsync(() => kpiApi.dashboard(), []);
  const alerts = useAsync(() => alertApi.summary(), []);

  const reloadAll = useCallback(async (force = false) => {
    await Promise.all([
      kpiApi.dashboard(force).then((data) => board.setData(data)),
      alerts.reload(),
    ]);
    setLastUpdate(new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.setData]);

  // El backend ya sirve del cache segun refresh_interval, asi que consultar
  // cada minuto no golpea la base de origen mas de lo necesario.
  useInterval(() => { reloadAll(false).catch(() => {}); }, 60000);

  const refreshOne = async (kpiId) => {
    setRefreshingId(kpiId);
    try {
      const fresh = await kpiApi.data(kpiId, true);
      board.setData((current) => ({
        ...current,
        widgets: current.widgets.map((w) =>
          w.kpiId === kpiId ? { ...fresh, kpiId, ok: true } : w),
      }));
    } catch {
      board.setData((current) => ({
        ...current,
        widgets: current.widgets.map((w) =>
          w.kpiId === kpiId ? { ...w, ok: false, error: 'No se pudo actualizar' } : w),
      }));
    } finally {
      setRefreshingId(null);
    }
  };

  if (board.loading && !board.data) return <Loading label="Cargando el tablero" />;
  if (board.error) return <div className="p-5"><ErrorState error={board.error} onRetry={board.reload} /></div>;

  const widgets = board.data?.widgets || [];
  const metaById = new Map((board.data?.kpis || []).map((k) => [k.id, k]));
  const failing = widgets.filter((w) => w.ok === false).length;

  return (
    <>
      <PageHeader
        title="Tablero"
        description={`Actualizado ${relative(lastUpdate)}`}
      >
        <Button icon={RefreshCw} onClick={() => reloadAll(true)}>Actualizar todo</Button>
      </PageHeader>

      <StatusLine alerts={alerts.data} failing={failing} total={widgets.length} />

      <div className="p-5">
        {widgets.length === 0 ? (
          <div className="panel">
            <EmptyState
              title="Todavía no hay indicadores"
              message="Un analista puede crear el primero desde Inteligencia: se define una consulta, se elige cómo mostrarla y aparece aquí."
            />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {widgets.map((widget) => (
              <KPIWidget
                key={widget.kpiId}
                widget={widget}
                meta={metaById.get(widget.kpiId)}
                refreshing={refreshingId === widget.kpiId}
                onRefresh={() => refreshOne(widget.kpiId)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * La linea de estado responde de un vistazo la unica pregunta que trae a
 * alguien a esta pantalla: hay algo mal ahora mismo. Por eso va arriba y
 * se lee como una frase, no como cuatro tarjetas con numeros grandes.
 */
function StatusLine({ alerts, failing, total }) {
  const critical = alerts?.critical_count || 0;
  const high = alerts?.high_count || 0;
  const open = alerts?.open_count || 0;

  const tone = critical > 0 ? 'border-l-sev-critical'
    : high > 0 ? 'border-l-sev-high'
    : failing > 0 ? 'border-l-sev-medium'
    : 'border-l-sev-ok';

  const message = critical > 0
    ? `${critical} alerta${critical > 1 ? 's' : ''} crítica${critical > 1 ? 's' : ''} sin resolver.`
    : high > 0
      ? `${high} alerta${high > 1 ? 's' : ''} de severidad alta sin resolver.`
      : open > 0
        ? `${open} alerta${open > 1 ? 's' : ''} abierta${open > 1 ? 's' : ''}, ninguna crítica.`
        : 'Todos los indicadores están dentro de sus umbrales.';

  return (
    <div className={`sev-edge ${tone} flex flex-wrap items-center justify-between gap-3
      border-b border-rule bg-panel px-5 py-3`}>
      <p className="text-sm font-medium">{message}</p>
      <p className="text-[13px] text-ink-2 tnum">
        {total} indicador{total === 1 ? '' : 'es'}
        {failing > 0 && <span className="text-sev-medium"> · {failing} con la consulta fallando</span>}
        {alerts?.last_24h > 0 && <span> · {alerts.last_24h} alertas en 24 h</span>}
      </p>
    </div>
  );
}
