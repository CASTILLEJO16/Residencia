import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import Button from '../components/common/Button';
import Field from '../components/common/Field';
import { Input } from '../components/common/Input';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
  const { login, user, sessionMessage, clearSessionMessage } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const destination = location.state?.from?.pathname || '/dashboard';

  useEffect(() => {
    if (user) navigate(user.mustChangePassword ? '/cambiar-contrasena' : destination, { replace: true });
  }, [user, navigate, destination]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    clearSessionMessage();
    try {
      const account = await login(form.username.trim(), form.password);
      navigate(account.mustChangePassword ? '/cambiar-contrasena' : destination, { replace: true });
    } catch (err) {
      setError(err.message);
      setForm((f) => ({ ...f, password: '' }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold">Inicia sesión</h1>
      <p className="mt-1 text-[13px] text-ink-2">
        Usa la cuenta que te asignó el administrador.
      </p>

      {sessionMessage && (
        <p className="panel sev-edge mt-5 border-l-steel px-3 py-2 text-[13px]">{sessionMessage}</p>
      )}

      {error && (
        <p role="alert" className="panel sev-edge mt-5 border-l-sev-critical px-3 py-2 text-[13px]">
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="Usuario" htmlFor="username">
          <Input
            id="username"
            autoComplete="username"
            autoFocus
            required
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
        </Field>

        <Field label="Contraseña" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>

        <Button type="submit" variant="primary" loading={submitting} className="w-full">
          Entrar
        </Button>
      </form>

      <p className="mt-6 text-[13px] leading-relaxed text-ink-3">
        Tras cinco intentos fallidos la cuenta se bloquea 15 minutos.
        Si eso pasa, pide a un administrador que la desbloquee.
      </p>
    </AuthLayout>
  );
}
