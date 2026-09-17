/** Etiqueta + control + ayuda o error, con la asociacion de accesibilidad hecha. */
export default function Field({ label, htmlFor, hint, error, required, children, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="mb-1 block text-[13px] font-medium text-ink-2">
          {label}
          {required && <span className="ml-0.5 text-sev-critical" aria-hidden="true">*</span>}
        </label>
      )}
      {children}
      {error
        ? <p className="mt-1 text-[13px] text-sev-critical">{error}</p>
        : hint && <p className="mt-1 text-[13px] text-ink-3">{hint}</p>}
    </div>
  );
}
