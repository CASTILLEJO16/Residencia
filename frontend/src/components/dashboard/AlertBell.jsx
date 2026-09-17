import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { alertApi } from '../../services/endpoints';
import { useAsync, useInterval } from '../../hooks/useAsync';
import { SeverityBadge } from '../common/Badge';
import { relative } from '../../utils/format';

/**
 * Contador de alertas sin resolver. Se refresca cada 30 s y solo cuando la
 * pestana esta visible, para no consultar en balde durante toda la noche.
 */
export default function AlertBell() {
  const [open, setOpen] = useState(false);
  const summary = useAsync(() => alertApi.summary(), []);
  const recent = useAsync(() => alertApi.list({ status: 'open', limit: 6 }), []);

  useInterval(() => {
    summary.reload().catch(() => {});
    if (open) recent.reload().catch(() => {});
  }, 30000);

  const pending = (summary.data?.open_count || 0) + (summary.data?.acknowledged_count || 0);
  const critical = summary.data?.critical_count || 0;

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen((v) => !v); if (!open) recent.reload().catch(() => {}); }}
        className="relative flex items-center gap-2 rounded-panel border border-rule px-2.5 py-1.5
          text-[13px] text-ink-2 hover:bg-paper hover:text-ink"
        aria-expanded={open}
      >
        <Bell size={15} className={critical > 0 ? 'text-sev-critical' : ''} />
        <span className="tnum">{pending}</span>
        {critical > 0 && (
          <span className="text-micro font-medium text-sev-critical tnum">{critical} críticas</span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="panel absolute right-0 top-full z-20 mt-1 w-80 shadow-raise">
            <p className="border-b border-rule px-3 py-2 text-[13px] font-semibold">
              Alertas sin resolver
            </p>
            <div className="max-h-80 overflow-y-auto">
              {recent.data?.data?.length ? recent.data.data.map((alert) => (
                <div key={alert.id} className="border-b border-rule/60 px-3 py-2 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <SeverityBadge value={alert.severity} />
                    <span className="text-micro text-ink-3">{relative(alert.triggered_at)}</span>
                  </div>
                  <p className="mt-1 text-[13px] leading-snug">{alert.message}</p>
                </div>
              )) : (
                <p className="px-3 py-6 text-center text-[13px] text-ink-2">
                  Nada pendiente ahora mismo.
                </p>
              )}
            </div>
            <Link
              to="/inteligencia?tab=alertas"
              onClick={() => setOpen(false)}
              className="block border-t border-rule px-3 py-2 text-[13px] text-steel hover:bg-paper"
            >
              Ver todas las alertas
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
