import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const WIDTHS = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };

export default function Modal({ open, onClose, title, description, size = 'md', footer, children }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink/30 p-4 sm:p-8"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`panel w-full ${WIDTHS[size]} shadow-raise outline-none`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-3.5">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-ink-2">{description}</p>}
          </div>
          <button onClick={onClose} className="mt-0.5 text-ink-3 hover:text-ink" aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-rule bg-paper px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
