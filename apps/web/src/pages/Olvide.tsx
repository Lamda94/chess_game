import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Field } from '@gambito/ui';
import { post } from '../api/client.js';
import { Logo } from '../components/Logo.js';

/**
 * Pedir el enlace de recuperación.
 *
 * La pantalla dice siempre lo mismo, haya cuenta con ese correo o no. No es una
 * imprecisión: si el mensaje cambiara, cualquiera podría averiguar acá quién
 * tiene cuenta en Gambito probando direcciones.
 */
export function Olvide() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [busy, setBusy] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await post('/auth/forgot-password', { email });
      setEnviado(true);
    } catch {
      // Un fallo del servidor tampoco puede delatar si el correo existe.
      setEnviado(true);
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

        {enviado ? (
          <>
            <h1 className="gb-display m-0 text-[32px] leading-tight">Revisá tu correo</h1>
            <p className="m-0 text-[15px]" style={{ color: 'var(--text-muted)' }}>
              Si hay una cuenta con <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>, te
              acaba de llegar un enlace para elegir una contraseña nueva. Vale una hora y sirve una
              sola vez.
            </p>
            <p className="m-0 text-[13px]" style={{ color: 'var(--text-muted)' }}>
              ¿No llegó? Mirá en el correo no deseado, o{' '}
              <button
                type="button"
                onClick={() => setEnviado(false)}
                className="underline"
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent-text)', cursor: 'pointer', font: 'inherit' }}
              >
                probá con otra dirección
              </button>
              .
            </p>
            <Link to="/entrar" className="gb-btn gb-btn--secondary gb-btn--block">
              Volver al ingreso
            </Link>
          </>
        ) : (
          <>
            <div>
              <h1 className="gb-display m-0 text-[32px] leading-tight">¿Olvidaste tu contraseña?</h1>
              <p className="mt-2 text-[15px]" style={{ color: 'var(--text-muted)' }}>
                Poné tu correo y te mandamos un enlace para elegir una nueva.
              </p>
            </div>

            <form className="flex flex-col gap-4" onSubmit={enviar}>
              <Field
                label="Correo electrónico"
                type="email"
                autoComplete="email"
                placeholder="tu@correo.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" variant="primary" block disabled={busy || email.length === 0} style={{ height: 52 }}>
                {busy ? 'Un momento…' : 'Mandarme el enlace'}
              </Button>
            </form>

            <Link to="/entrar" className="text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
              Volver al ingreso
            </Link>
          </>
        )}
      </section>
    </div>
  );
}
