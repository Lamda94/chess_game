import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Spinner } from '@gambito/ui';
import { post } from '../api/client.js';
import { Logo } from '../components/Logo.js';

type Estado = 'verificando' | 'listo' | 'error';

/** Pantalla a la que lleva el enlace del correo de alta. */
export function Verificar() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const queryClient = useQueryClient();
  const [estado, setEstado] = useState<Estado>(token ? 'verificando' : 'error');
  // React ejecuta los efectos dos veces en desarrollo, y el token vale una sola:
  // sin esto el segundo intento fallaría y la pantalla mostraría un error falso.
  const yaFue = useRef(false);

  useEffect(() => {
    if (!token || yaFue.current) return;
    yaFue.current = true;

    post('/auth/verify-email', { token })
      .then(() => {
        setEstado('listo');
        // Si hay sesión abierta, que el aviso de "sin verificar" desaparezca.
        void queryClient.invalidateQueries({ queryKey: ['session'] });
      })
      .catch(() => setEstado('error'));
  }, [queryClient, token]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10" style={{ background: 'var(--bg-base)' }}>
      <section className="flex w-full max-w-[420px] flex-col gap-6">
        <Link to="/" className="flex items-center gap-2.5" style={{ color: 'var(--text-primary)' }}>
          <Logo size={24} />
          <span className="gb-display text-[19px] tracking-[0.18em]">GAMBITO</span>
        </Link>

        {estado === 'verificando' ? (
          <Spinner label="Confirmando tu correo…" />
        ) : estado === 'listo' ? (
          <>
            <h1 className="gb-display m-0 text-[32px] leading-tight">Correo confirmado</h1>
            <p className="m-0 text-[15px]" style={{ color: 'var(--text-muted)' }}>
              Listo. Si alguna vez perdés la contraseña, vas a poder recuperarla desde esta dirección.
            </p>
            <Link to="/" className="gb-btn gb-btn--primary gb-btn--block">
              Ir a jugar
            </Link>
          </>
        ) : (
          <>
            <h1 className="gb-display m-0 text-[32px] leading-tight">Ese enlace ya no sirve</h1>
            <p className="m-0 text-[15px]" style={{ color: 'var(--text-muted)' }}>
              Los enlaces de confirmación valen 24 horas y se usan una sola vez. Entrá a tu cuenta y
              pedí uno nuevo desde el aviso de arriba.
            </p>
            <Link to="/" className="gb-btn gb-btn--primary gb-btn--block">
              Ir a mi cuenta
            </Link>
          </>
        )}
      </section>
    </div>
  );
}
