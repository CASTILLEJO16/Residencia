/**
 * Pantalla de acceso. El lado izquierdo muestra lo que el sistema hace
 * en realidad: vigilar cifras y avisar cuando algo se sale de rango.
 * La franja de severidades es la firma visual de toda la aplicacion.
 */
export default function AuthLayout({ children }) {
  return (
    <div className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden flex-col justify-between bg-ink px-12 py-14 text-white lg:flex">
        <div>
          <p className="text-[13px] tracking-wide text-white/50">Inteligencia Operativa</p>
        </div>

        <div className="max-w-md">
          <h1 className="text-4xl font-semibold leading-tight">
            Las cifras que importan, vigiladas todo el día.
          </h1>
          <p className="mt-4 leading-relaxed text-white/60">
            El sistema consulta tus indicadores cada pocos minutos, avisa
            cuando alguno cruza un umbral y abre el incidente para que
            alguien lo atienda.
          </p>
        </div>

        <div>
          <div className="flex h-1.5 w-64 overflow-hidden rounded-full" aria-hidden="true">
            <span className="flex-1 bg-sev-low" />
            <span className="flex-1 bg-sev-medium" />
            <span className="flex-1 bg-sev-high" />
            <span className="flex-1 bg-sev-critical" />
          </div>
          <p className="mt-3 text-[13px] text-white/40">
            Baja · Media · Alta · Crítica
          </p>
        </div>
      </aside>

      <main className="flex items-center justify-center bg-paper px-6 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
