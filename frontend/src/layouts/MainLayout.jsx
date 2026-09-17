import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutGrid, Brain, LifeBuoy, FileBarChart, Settings2, ScrollText,
  LogOut, Menu, X, UserRound,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { ROLES } from '../utils/constants';
import AlertBell from '../components/dashboard/AlertBell';

const NAV = [
  { to: '/dashboard',    label: 'Tablero',      icon: LayoutGrid,
    roles: [ROLES.ADMIN, ROLES.ANALISTA, ROLES.CONSULTA, ROLES.AUDITORIA] },
  { to: '/inteligencia', label: 'Inteligencia', icon: Brain,
    roles: [ROLES.ADMIN, ROLES.ANALISTA] },
  { to: '/incidentes',   label: 'Incidentes',   icon: LifeBuoy,
    roles: [ROLES.ADMIN, ROLES.ANALISTA, ROLES.CONSULTA] },
  { to: '/reportes',     label: 'Reportes',     icon: FileBarChart,
    roles: [ROLES.ADMIN, ROLES.ANALISTA, ROLES.CONSULTA, ROLES.AUDITORIA] },
  { to: '/administracion', label: 'Administración', icon: Settings2,
    roles: [ROLES.ADMIN] },
  { to: '/auditoria',    label: 'Auditoría',    icon: ScrollText,
    roles: [ROLES.ADMIN, ROLES.AUDITORIA] },
];

export default function MainLayout() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const [railOpen, setRailOpen] = useState(false);

  const items = NAV.filter((item) => hasRole(item.roles));

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-full">
      {railOpen && (
        <div
          className="fixed inset-0 z-20 bg-ink/30 lg:hidden"
          onClick={() => setRailOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Riel de navegacion permanente: esto es una consola, no un sitio web. */}
      <nav
        aria-label="Secciones"
        className={`fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-rule
          bg-panel transition-transform lg:static lg:translate-x-0
          ${railOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-14 items-center justify-between border-b border-rule px-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-2 flex-col gap-px" aria-hidden="true">
              <span className="block h-1 w-1 bg-sev-critical" />
              <span className="block h-1 w-1 bg-sev-medium" />
            </span>
            <span className="font-semibold leading-none">Inteligencia Operativa</span>
          </div>
          <button
            className="text-ink-3 lg:hidden"
            onClick={() => setRailOpen(false)}
            aria-label="Cerrar menú"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setRailOpen(false)}
              className={({ isActive }) => `flex items-center gap-2.5 border-l-[3px] px-4 py-2 text-sm
                ${isActive
                  ? 'border-l-steel bg-steel-soft font-medium text-steel'
                  : 'border-l-transparent text-ink-2 hover:bg-paper hover:text-ink'}`}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </div>

        <div className="border-t border-rule p-3">
          <div className="flex items-center gap-2.5 px-1 py-1.5">
            <UserRound size={16} className="shrink-0 text-ink-3" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium leading-tight">{user?.fullName}</p>
              <p className="truncate text-micro text-ink-3">{user?.role?.replace('SIO_', '')}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-1 flex w-full items-center gap-2.5 rounded-panel px-1 py-1.5
              text-[13px] text-ink-2 hover:bg-paper hover:text-ink"
          >
            <LogOut size={15} />
            Cerrar sesión
          </button>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-rule bg-panel px-4">
          <button
            className="text-ink-2 lg:hidden"
            onClick={() => setRailOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1" />
          <AlertBell />
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
