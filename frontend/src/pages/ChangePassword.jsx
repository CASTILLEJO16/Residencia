import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import Button from '../components/common/Button';
import Field from '../components/common/Field';
import { Input } from '../components/common/Input';
import { useAuth } from '../hooks/useAuth';

const RULES = [
  { test: (v) => v.length >= 10, label: 'Al menos 10 caracteres' },
  { test: (v) => /[a-z]/.test(v), label: 'Una minúscula' },
  { test: (v) => /[A-Z]/.test(v), label: 'Una mayúscula' },
  { test: (v) => /[0-9]/.test(v), label: 'Un número' },
  { test: (v) => /[^A-Za-z0-9]/.test(v), label: 'Un carácter especial' },
];

export default function ChangePassword() {
  const { user, changePassword } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const checks = RULES.map((rule) => ({ ...rule, ok: rule.test(form.next) }));
  const strong = checks.every((c) => c.ok);
  const matches = form.next.length > 0 && form.next === form.confirm;

  const onSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await changePassword(form.current, form.next);
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold">Cambia tu contraseña</h1>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
        {user?.mustChangePassword
          ? 'Tu contraseña es temporal. Elige una nueva para continuar.'
          : 'Al cambiarla se cerrarán todas tus sesiones abiertas.'}
      </p>

      {error && (
        <p role="alert" className="panel sev-edge mt-5 border-l-sev-critical px-3 py-2 text-[13px]">
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="Contraseña actual" htmlFor="current">
          <Input
            id="current" type="password" autoComplete="current-password" required
            value={form.current}
            onChange={(e) => setForm({ ...form, current: e.target.value })}
          />
        </Field>

        <Field label="Contraseña nueva" htmlFor="next">
          <Input
            id="next" type="password" autoComplete="new-password" required
            value={form.next}
            onChange={(e) => setForm({ ...form, next: e.target.value })}
          />
        </Field>

        <ul className="space-y-1">
          {checks.map((check) => (
            <li key={check.label} className="flex items-center gap-2 text-[13px]">
              <span
                className={`h-1.5 w-1.5 rounded-full ${check.ok ? 'bg-sev-ok' : 'bg-rule'}`}
                aria-hidden="true"
              />
              <span className={check.ok ? 'text-ink-2' : 'text-ink-3'}>{check.label}</span>
            </li>
          ))}
        </ul>

        <Field
          label="Repite la contraseña nueva"
          htmlFor="confirm"
          error={form.confirm && !matches ? 'Las contraseñas no coinciden' : null}
        >
          <Input
            id="confirm" type="password" autoComplete="new-password" required
            invalid={Boolean(form.confirm) && !matches}
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          />
        </Field>

        <Button
          type="submit" variant="primary" className="w-full"
          loading={submitting} disabled={!strong || !matches}
        >
          Guardar contraseña
        </Button>
      </form>
    </AuthLayout>
  );
}
