import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { authApi } from '../services/endpoints';
import { tokenStore, setSessionExpiredHandler } from '../services/api';
import { ROLES } from '../utils/constants';

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
      if (!tokenStore.access) { setLoading(false); return; }
      try {
        const me = await authApi.me();
        if (!cancelled) setUser(me);
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
    try { await authApi.logout(tokenStore.refresh); } catch { /* la sesion local se cierra igual */ }
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
    isAdmin: user?.role === ROLES.ADMIN,
    canEdit: user?.role === ROLES.ADMIN || user?.role === ROLES.ANALISTA,
    hasRole: (...roles) => roles.flat().includes(user?.role),
  }), [user, loading, sessionMessage, login, logout, changePassword]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
