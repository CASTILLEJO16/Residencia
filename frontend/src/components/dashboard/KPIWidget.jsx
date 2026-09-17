import { AlertTriangle, RefreshCw, Scissors } from 'lucide-react';
import ApexChart from './ApexChart';
import { compactNumber, cell, relative } from '../../utils/format';

/**
 * Un panel por KPI. La cabecera es siempre igual y el cuerpo cambia segun
 * el tipo de widget, de modo que la vista se lea como un tablero de
 * instrumentos y no como una coleccion de tarjetas sueltas.
 */
export default function KPIWidget({ widget, meta, onRefresh, refreshing }) {
  const span = ['table', 'line', 'area', 'bar'].includes(widget.widgetType)
    ? 'md:col-span-2' : '';

  return (
    <section className={`panel flex flex-col ${span}`}>
      <header className="flex items-start justify-between gap-2 border-b border-rule px-3.5 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold leading-tight">{widget.name || meta?.name}</h2>
          {meta?.description && (
            <p className="mt-0.5 truncate text-micro text-ink-3">{meta.description}</p>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          title="Actualizar ahora"
          aria-label={`Actualizar ${widget.name}`}
          className="shrink-0 text-ink-3 hover:text-steel disabled:opacity-40"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="flex-1 px-3.5 py-3">
        {widget.ok === false ? <WidgetError message={widget.error} /> : <WidgetBody widget={widget} />}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-rule px-3.5 py-1.5 text-micro text-ink-3">
        <span>{widget.capturedAt ? `Medido ${relative(widget.capturedAt)}` : 'Sin medición'}</span>
        <span className="flex items-center gap-2">
          {widget.truncated && (
            <span className="flex items-center gap-1 text-sev-medium" title="Se alcanzó el límite de filas">
              <Scissors size={11} /> recortado
            </span>
          )}
          {widget.fromCache && <span>caché</span>}
        </span>
      </footer>
    </section>
  );
}

function WidgetError({ message }) {
  return (
    <div className="flex h-full min-h-[120px] flex-col items-start justify-center gap-1.5">
      <span className="flex items-center gap-1.5 text-[13px] font-medium text-sev-critical">
        <AlertTriangle size={14} /> La consulta falló
      </span>
      <p className="text-[13px] leading-snug text-ink-2">{message}</p>
    </div>
  );
}

function WidgetBody({ widget }) {
  switch (widget.widgetType) {
    case 'number':
      return (
        <div className="flex h-full min-h-[110px] flex-col justify-center">
          <p className="text-[42px] font-semibold leading-none tnum">
            {compactNumber(widget.value)}
          </p>
          {widget.valueColumn && (
            <p className="mt-2 text-[13px] text-ink-2">{widget.valueColumn}</p>
          )}
        </div>
      );

    case 'gauge':
      return (
        <ApexChart
          type="radialBar"
          height={200}
          series={[Math.max(0, Math.min(100, Number(widget.value) || 0))]}
        />
      );

    case 'pie':
      return <ApexChart type="pie" height={220} series={widget.series || []} labels={widget.labels} />;

    case 'line':
    case 'area':
    case 'bar':
      if (!widget.series?.length) return <NoData />;
      return (
        <ApexChart
          type={widget.widgetType}
          height={230}
          series={widget.series}
          categories={widget.categories}
        />
      );

    case 'table':
    default:
      return <MiniTable widget={widget} />;
  }
}

function MiniTable({ widget }) {
  const rows = widget.rows || [];
  if (!rows.length) return <NoData />;
  const columns = (widget.columns || []).map((c) => c.name).slice(0, 6);

  return (
    <div className="-mx-1 max-h-64 overflow-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead className="sticky top-0 bg-panel">
          <tr className="border-b border-rule text-left">
            {columns.map((name) => (
              <th key={name} className="whitespace-nowrap px-2 py-1.5 font-semibold text-ink-2">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 50).map((row, i) => (
            <tr key={i} className="border-b border-rule/60 last:border-0">
              {columns.map((name) => (
                <td key={name} className="whitespace-nowrap px-2 py-1.5 tnum">{cell(row[name])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NoData() {
  return (
    <div className="flex h-full min-h-[110px] items-center justify-center text-[13px] text-ink-3">
      La consulta no devolvió filas
    </div>
  );
}
