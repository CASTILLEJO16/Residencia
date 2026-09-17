import { Loader2 } from 'lucide-react';

/**
 * Tabla densa. Las filas se separan por reglas de 1px en vez de tarjetas:
 * el objetivo es que quepan muchas y se puedan comparar de un vistazo.
 */
export default function Table({
  columns, rows, loading, empty, onRowClick, rowKey = (r) => r.id, rowAccent,
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-ink-2">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Cargando</span>
      </div>
    );
  }

  if (!rows?.length) {
    return <div className="px-4 py-12 text-center text-sm text-ink-2">{empty}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-rule text-left">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={col.width ? { width: col.width } : undefined}
                className={`whitespace-nowrap px-3 py-2 text-[13px] font-semibold text-ink-2
                  ${col.align === 'right' ? 'text-right' : ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const accent = rowAccent?.(row);
            return (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row); } : undefined}
                className={`border-b border-rule/70 last:border-0
                  ${onRowClick ? 'cursor-pointer hover:bg-paper' : ''}
                  ${accent ? `sev-edge ${accent}` : ''}`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2 align-middle ${col.align === 'right' ? 'text-right tnum' : ''}
                      ${col.nowrap ? 'whitespace-nowrap' : ''}`}
                  >
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
