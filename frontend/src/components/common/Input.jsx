import { forwardRef } from 'react';

const base = `w-full rounded-panel border bg-panel px-2.5 text-sm text-ink
  placeholder:text-ink-3 disabled:bg-paper disabled:text-ink-2`;

export const Input = forwardRef(function Input({ invalid, className = '', ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={`${base} h-9 ${invalid ? 'border-sev-critical' : 'border-rule'} ${className}`}
      {...props}
    />
  );
});

export const Textarea = forwardRef(function Textarea({ invalid, className = '', ...props }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={`${base} py-2 leading-relaxed ${invalid ? 'border-sev-critical' : 'border-rule'} ${className}`}
      {...props}
    />
  );
});

export const Select = forwardRef(function Select({ invalid, children, className = '', ...props }, ref) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={`${base} h-9 ${invalid ? 'border-sev-critical' : 'border-rule'} ${className}`}
      {...props}
    >
      {children}
    </select>
  );
});

/** Editor de SQL: monoespaciado porque la alineacion de la consulta importa. */
export const CodeArea = forwardRef(function CodeArea({ invalid, className = '', ...props }, ref) {
  return (
    <textarea
      ref={ref}
      spellCheck={false}
      aria-invalid={invalid || undefined}
      className={`w-full rounded-panel border bg-[#F7F9FB] p-3 font-mono text-[13px]
        leading-relaxed text-ink ${invalid ? 'border-sev-critical' : 'border-rule'} ${className}`}
      {...props}
    />
  );
});
