import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Dashboard from './pages/Dashboard';
import Intelligence from './pages/Intelligence';
import Incidents from './pages/Incidents';
import Reports from './pages/Reports';
import Admin from './pages/Admin';
import Audit from './pages/Audit';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';
import { ROLES } from './utils/constants';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/cambiar-contrasena" element={
              <ProtectedRoute allowPasswordChange><ChangePassword /></ProtectedRoute>
            } />

            <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/inteligencia" element={
                <ProtectedRoute roles={[ROLES.ADMIN, ROLES.ANALISTA]}><Intelligence /></ProtectedRoute>
              } />
              <Route path="/incidentes" element={
                <ProtectedRoute roles={[ROLES.ADMIN, ROLES.ANALISTA, ROLES.CONSULTA]}><Incidents /></ProtectedRoute>
              } />
              <Route path="/reportes" element={<Reports />} />
              <Route path="/administracion" element={
                <ProtectedRoute roles={[ROLES.ADMIN]}><Admin /></ProtectedRoute>
              } />
              <Route path="/auditoria" element={
                <ProtectedRoute roles={[ROLES.ADMIN, ROLES.AUDITORIA]}><Audit /></ProtectedRoute>
              } />
              <Route path="/ajustes" element={<Settings />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
