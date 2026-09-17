import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'bg-steel text-white border-steel hover:bg-steel-dark hover:border-steel-dark',
  secondary: 'bg-panel text-ink border-rule hover:bg-paper',
  quiet: 'bg-transparent text-ink-2 border-transparent hover:bg-paper hover:text-ink',
  danger: 'bg-panel text-sev-critical border-rule hover:bg-sev-critical hover:text-white hover:border-sev-critical',
};

const SIZES = {
  sm: 'h-7 px-2.5 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
};

export default function Button({
  variant = 'secondary', size = 'md', loading = false, icon: Icon,
  children, className = '', disabled, ...props
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-panel border font-medium
        transition-colors disabled:cursor-not-allowed disabled:opacity-50
        ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {loading
        ? <Loader2 size={size === 'sm' ? 13 : 15} className="animate-spin" />
        : Icon && <Icon size={size === 'sm' ? 13 : 15} />}
      {children}
    </button>
  );
}
