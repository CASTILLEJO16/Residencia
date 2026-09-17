export default function PageHeader({ title, description, children }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-5 py-4">
      <div>
        <h1 className="text-lg font-semibold leading-tight">{title}</h1>
        {description && <p className="mt-0.5 text-[13px] text-ink-2">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
