import { Loader2 } from 'lucide-react';
import Button from './Button';

export function Loading({ label = 'Cargando' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-ink-2">
      <Loader2 size={18} className="animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

/** Un error dice que pasó y qué hacer, sin disculpas ni vaguedades. */
export function ErrorState({ error, onRetry }) {
  return (
    <div className="panel sev-edge border-l-sev-critical p-4">
      <p className="text-sm font-medium">No se pudieron cargar los datos</p>
      <p className="mt-1 text-[13px] text-ink-2">{error?.message || 'Error desconocido'}</p>
      {onRetry && <Button size="sm" className="mt-3" onClick={onRetry}>Reintentar</Button>}
    </div>
  );
}

/** Una pantalla vacía es una invitación a actuar, no un mensaje triste. */
export function EmptyState({ title, message, action }) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-sm font-medium">{title}</p>
      {message && <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-ink-2">{message}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
