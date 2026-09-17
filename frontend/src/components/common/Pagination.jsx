import { ChevronLeft, ChevronRight } from 'lucide-react';
import Button from './Button';

export default function Pagination({ meta, onChange }) {
  if (!meta || meta.pages <= 1) return null;
  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="flex items-center justify-between border-t border-rule px-3 py-2">
      <p className="text-[13px] text-ink-2 tnum">
        {from}–{to} de {meta.total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm" icon={ChevronLeft}
          disabled={meta.page <= 1}
          onClick={() => onChange(meta.page - 1)}
        >
          Anterior
        </Button>
        <span className="text-[13px] text-ink-2 tnum">{meta.page} / {meta.pages}</span>
        <Button
          size="sm"
          disabled={meta.page >= meta.pages}
          onClick={() => onChange(meta.page + 1)}
        >
          Siguiente <ChevronRight size={13} />
        </Button>
      </div>
    </div>
  );
}
