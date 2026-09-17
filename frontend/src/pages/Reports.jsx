import { useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { reportApi } from '../services/endpoints';
import { download } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../contexts/ToastContext';
import PageHeader from '../components/common/PageHeader';
import Button from '../components/common/Button';
import Field from '../components/common/Field';
import { Input, Select } from '../components/common/Input';
import Table from '../components/common/Table';
import { ErrorState, EmptyState } from '../components/common/States';
import { cell } from '../utils/format';

/** Cada reporte expone solo los filtros que le sirven. */
const FILTERS = {
  kpi_history: ['from', 'to'],
  alerts: ['from', 'to', 'severity', 'alertStatus'],
  incidents: ['from', 'to', 'priority', 'ticketStatus'],
  audit: ['from', 'to', 'entityType'],
};

export default function Reports() {
  const toast = useToast();
  const catalog = useAsync(() => reportApi.catalog(), []);
  const [type, setType] = useState('incidents');
  const [filters, setFilters] = useState({});
  const [exporting, setExporting] = useState(null);

  const preview = useAsync(
    () => reportApi.preview(type, { ...clean(filters), limit: 200 }),
    [type, JSON.stringify(filters)]
  );

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));

  const doExport = async (format) => {
    setExporting(format);
    try {
      await download(`/reports/${type}/export`, { ...clean(filters), format });
      toast.success('Descarga lista');
    } catch (err) {
      toast.error(err);
    } finally {
      setExporting(null);
    }
  };

  const active = FILTERS[type] || [];

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Los archivos se arman en el servidor, así que un reporte grande no congela el navegador."
      >
        <Button icon={FileSpreadsheet} loading={exporting === 'xlsx'} onClick={() => doExport('xlsx')}>
          Excel
        </Button>
        <Button icon={FileText} loading={exporting === 'pdf'} onClick={() => doExport('pdf')}>
          PDF
        </Button>
        <Button icon={Download} loading={exporting === 'csv'} onClick={() => doExport('csv')}>
          CSV
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-end gap-3 border-b border-rule bg-panel px-5 py-3">
        <Field label="Reporte" htmlFor="rep-type" className="w-52">
          <Select id="rep-type" value={type}
            onChange={(e) => { setType(e.target.value); setFilters({}); }}>
            {(catalog.data || []).map((r) => (
              <option key={r.key} value={r.key}>{r.title}</option>
            ))}
          </Select>
        </Field>

        {active.includes('from') && (
          <Field label="Desde" htmlFor="rep-from" className="w-44">
            <Input id="rep-from" type="date" value={filters.from || ''}
              onChange={(e) => set({ from: e.target.value })} />
          </Field>
        )}
        {active.includes('to') && (
          <Field label="Hasta" htmlFor="rep-to" className="w-44">
            <Input id="rep-to" type="date" value={filters.to || ''}
              onChange={(e) => set({ to: e.target.value })} />
          </Field>
        )}
        {active.includes('severity') && (
          <Field label="Severidad" htmlFor="rep-sev" className="w-40">
            <Select id="rep-sev" value={filters.severity || ''}
              onChange={(e) => set({ severity: e.target.value })}>
              <option value="">Cualquiera</option>
              <option value="critical">Crítica</option>
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </Select>
          </Field>
        )}
        {active.includes('alertStatus') && (
          <Field label="Estado" htmlFor="rep-astatus" className="w-40">
            <Select id="rep-astatus" value={filters.status || ''}
              onChange={(e) => set({ status: e.target.value })}>
              <option value="">Cualquiera</option>
              <option value="open">Abiertas</option>
              <option value="acknowledged">Atendidas</option>
              <option value="resolved">Resueltas</option>
            </Select>
          </Field>
        )}
        {active.includes('priority') && (
          <Field label="Prioridad" htmlFor="rep-prio" className="w-40">
            <Select id="rep-prio" value={filters.priority || ''}
              onChange={(e) => set({ priority: e.target.value })}>
              <option value="">Cualquiera</option>
              <option value="critical">Crítica</option>
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </Select>
          </Field>
        )}
        {active.includes('ticketStatus') && (
          <Field label="Estado" htmlFor="rep-tstatus" className="w-40">
            <Select id="rep-tstatus" value={filters.status || ''}
              onChange={(e) => set({ status: e.target.value })}>
              <option value="">Cualquiera</option>
              <option value="open">Abierto</option>
              <option value="in_progress">En curso</option>
              <option value="escalated">Escalado</option>
              <option value="closed">Cerrado</option>
            </Select>
          </Field>
        )}
        {active.includes('entityType') && (
          <Field label="Entidad" htmlFor="rep-entity" className="w-40">
            <Select id="rep-entity" value={filters.entityType || ''}
              onChange={(e) => set({ entityType: e.target.value })}>
              <option value="">Cualquiera</option>
              <option value="user">Usuarios</option>
              <option value="kpi">Indicadores</option>
              <option value="threshold">Umbrales</option>
              <option value="alert">Alertas</option>
              <option value="ticket">Incidentes</option>
              <option value="role">Roles</option>
            </Select>
          </Field>
        )}

        {Object.keys(clean(filters)).length > 0 && (
          <Button size="sm" variant="quiet" onClick={() => setFilters({})}>Quitar filtros</Button>
        )}
      </div>

      <div className="p-5">
        {preview.error ? (
          <ErrorState error={preview.error} onRetry={preview.reload} />
        ) : (
          <div className="panel">
            {preview.data && (
              <p className="border-b border-rule px-3 py-2 text-[13px] text-ink-2 tnum">
                {preview.data.rowCount} registro(s)
                {preview.data.rowCount >= 200 && ' · se muestran los primeros 200, la exportación los incluye todos'}
              </p>
            )}
            <Table
              loading={preview.loading}
              rows={preview.data?.rows}
              rowKey={(_, i) => i}
              empty={<EmptyState
                title="Sin datos para esos filtros"
                message="Amplía el rango de fechas o quita algún filtro."
              />}
              columns={(preview.data?.columns || []).map((col) => ({
                key: col.key,
                header: col.header,
                nowrap: true,
                align: col.type === 'number' ? 'right' : undefined,
                render: (row) => cell(row[col.key]),
              }))}
            />
          </div>
        )}
      </div>
    </>
  );
}

function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v != null));
}

