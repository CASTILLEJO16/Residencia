import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="panel sev-edge max-w-md border-l-ink-3 p-6">
        <p className="text-sm font-medium">Esa dirección no existe</p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          Puede que el enlace esté mal escrito o que la sección se haya movido.
        </p>
        <Link to="/dashboard" className="mt-4 inline-block text-[13px] font-medium text-steel hover:underline">
          Ir al tablero
        </Link>
      </div>
    </div>
  );
}
