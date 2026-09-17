import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Loading } from './States';

/**
 * Puerta de entrada de cada ruta. El backend vuelve a verificar todo:
 * esto solo evita mostrar pantallas que la persona no podrá usar.
 */
export default function ProtectedRoute({ children, roles, allowPasswordChange = false }) {
  const { user, loading, hasRole } = useAuth();
  const location = useLocation();

  if (loading) return <Loading label="Verificando sesión" />;

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  // Con contraseña temporal solo se puede llegar a la pantalla de cambio.
  if (user.mustChangePassword && !allowPasswordChange) {
    return <Navigate to="/cambiar-contrasena" replace />;
  }
  if (roles && !hasRole(roles)) {
    return (
      <div className="p-5">
        <div className="panel sev-edge border-l-sev-high p-5">
          <p className="text-sm font-medium">Esta sección no está disponible para tu rol</p>
          <p className="mt-1 text-[13px] text-ink-2">
            Tu cuenta tiene el rol {user.role?.replace('SIO_', '')}. Pide a un administrador
            que te asigne otro si necesitas entrar aquí.
          </p>
        </div>
      </div>
    );
  }

  return children;
}
