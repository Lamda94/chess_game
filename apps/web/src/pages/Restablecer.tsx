import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Field } from '@gambito/ui';
import type { SessionUser } from '@gambito/shared';
import { post } from '../api/client.js';
import { Logo } from '../components/Logo.js';

/** Elegir contraseña nueva con el token que vino en el enlace del correo. */
export function Restablecer() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [password, setPassword] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const corta = password.length > 0 && password.length < 10;
  const noCoinciden = repetida.length > 0 && password !== repetida;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // El servidor devuelve la sesión ya abierta: no tiene sentido pedirle a
      // alguien que acaba de probar que es dueño del correo que vuelva a entrar.
      const { user } = await post<{ user: SessionUser }>('/auth/reset-password', { token, password });
      queryClient.setQueryData(['session'], { user });
      navigate('/', { replace: true });
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : 'No se pudo cambiar la contraseña.';
      setError(mensaje);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10" style={{ background: 'var(--bg-base)' }}>
      <section className="flex w-full max-w-[420px] flex-col gap-6">
        <Link to="/entrar" className="flex items-center gap-2.5" style={{ color: 'var(--text-primary)' }}>
          <Logo size={24} />
          <span className="gb-display text-[19px] tracking-[0.18em]">GAMBITO</span>
        </Link>

        {token.length === 0 ? (
          <>
            <h1 className="gb-display m-0 text-[32px] leading-tight">Enlace incompleto</h1>
            <p className="m-0 text-[15px]" style={{ color: 'var(--text-muted)' }}>
              La dirección no trae el código. Copiala entera desde el correo, o pedí un enlace nuevo.
            </p>
            <Link to="/olvide" className="gb-btn gb-btn--primary gb-btn--block">
              Pedir un enlace nuevo
            </Link>
          </>
        ) : (
          <>
            <div>
              <h1 className="gb-display m-0 text-[32px] leading-tight">Elegí una contraseña nueva</h1>
              <p className="mt-2 text-[15px]" style={{ color: 'var(--text-muted)' }}>
                Al guardarla se cierran las demás sesiones abiertas de tu cuenta.
              </p>
            </div>

            <form className="flex flex-col gap-4" onSubmit={enviar}>
              <Field
                label="Contraseña nueva"
                type="password"
                autoComplete="new-password"
                hint="Mínimo 10 caracteres"
                error={corta ? 'Mínimo 10 caracteres' : null}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Field
                label="Repetila"
                type="password"
                autoComplete="new-password"
                error={noCoinciden ? 'No coincide con la anterior' : null}
                value={repetida}
                onChange={(e) => setRepetida(e.target.value)}
              />

              {error ? (
                <p className="m-0 text-[13px]" style={{ color: 'var(--danger)' }}>
                  {error}{' '}
                  <Link to="/olvide" style={{ color: 'var(--accent-text)' }}>
                    Pedir uno nuevo
                  </Link>
                </p>
              ) : null}

              <Button
                type="submit"
                variant="primary"
                block
                disabled={busy || password.length < 10 || password !== repetida}
                style={{ height: 52 }}
              >
                {busy ? 'Guardando…' : 'Guardar y entrar'}
              </Button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
