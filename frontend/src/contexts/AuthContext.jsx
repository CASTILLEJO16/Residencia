import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { authApi } from '../services/endpoints';
import { tokenStore, setSessionExpiredHandler, restoreSession } from '../services/api';
import { ROLES, normalizeRole, hasRoleAny } from '../utils/constants';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionMessage, setSessionMessage] = useState(null);

  // El interceptor avisa cuando la renovacion del token falla.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      setSessionMessage('Tu sesión terminó. Inicia sesión de nuevo.');
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Recupera la sesion a partir de la cookie httpOnly del refresh token.
      try {
        const session = await restoreSession();
        if (!cancelled) setUser(session.user);
      } catch {
        tokenStore.clear();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (username, password) => {
    const result = await authApi.login(username, password);
    tokenStore.set(result);
    setUser(result.user);
    setSessionMessage(null);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* la sesion local se cierra igual */ }
    tokenStore.clear();
    setUser(null);
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    await authApi.changePassword(currentPassword, newPassword);
    // El backend revoca todas las sesiones al cambiar la contrasena.
    tokenStore.clear();
    setUser(null);
    setSessionMessage('Contraseña actualizada. Inicia sesión con la nueva.');
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    sessionMessage,
    clearSessionMessage: () => setSessionMessage(null),
    login,
    logout,
    changePassword,
    isAdmin: normalizeRole(user?.role) === ROLES.ADMIN,
    canEdit: hasRoleAny(user?.role, [ROLES.ADMIN, ROLES.ANALISTA]),
    hasRole: (...roles) => hasRoleAny(user?.role, roles.flat()),
  }), [user, loading, sessionMessage, login, logout, changePassword]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
