import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Field } from '@gambito/ui';
import { ChessGame } from '@gambito/chess-core';
import { ApiError, get } from '../api/client.js';
import { useSession } from '../state/session.js';
import { Logo } from '../components/Logo.js';
import { Piece } from '../board/pieces.js';
import { FILES, RANKS, isLightSquare } from '@gambito/chess-core';

/** Tablero decorativo del panel de marca: una posición real, sin interacción. */
function PanelTablero() {
  const game = new ChessGame('r1bq1rk1/pp2bppp/2n1pn2/3p4/3P1B2/2NBPN2/PP3PPP/R2Q1RK1 w - - 0 1');
  const pieces = new Map(game.pieces().map((p) => [p.square, p]));
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-[58%] lg:block"
      style={{ width: 404, height: 404, borderRadius: 12, overflow: 'hidden', boxShadow: '0 40px 70px rgba(0,0,0,0.55)' }}
      aria-hidden="true"
    >
      {RANKS.map((rank) => (
        <div key={rank} style={{ display: 'flex' }}>
          {FILES.map((file) => {
            const id = `${file}${rank}`;
            const piece = pieces.get(id);
            return (
              <div
                key={id}
                style={{
                  width: 50.5,
                  height: 50.5,
                  background: isLightSquare(id) ? 'var(--board-light)' : 'var(--board-dark)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {piece ? <Piece type={piece.type} color={piece.color} size={43} /> : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function Entrar() {
  const { user, login, register } = useSession();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [values, setValues] = useState({ username: '', email: '', password: '', identifier: '' });
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [busy, setBusy] = useState(false);

  const providers = useQuery({
    queryKey: ['providers'],
    queryFn: () => get<{ google: boolean }>('/auth/providers'),
    staleTime: Infinity,
  });

  if (user) return <Navigate to={user.needsUsername ? '/elegir-nombre' : '/'} replace />;

  const apiError = error instanceof ApiError ? error : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') {
        await register({
          username: values.username,
          email: values.email,
          password: values.password,
          acceptedTerms: true,
        });
      } else {
        await login({ identifier: values.identifier, password: values.password });
      }
    } catch (caught) {
      setError(caught as Error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside
        className="relative hidden shrink-0 overflow-hidden lg:flex lg:w-[620px] lg:flex-col lg:justify-between lg:p-14"
        style={{ background: 'var(--bg-surface)', borderRight: '1px solid var(--border)', minHeight: '100vh' }}
      >
        <div className="relative z-10 flex items-center gap-3">
          <Logo size={27} />
          <span className="gb-display text-[22px] tracking-[0.18em]">GAMBITO</span>
        </div>
        <PanelTablero />
        <div
          className="relative max-w-[460px] pt-24"
          style={{
            background:
              'linear-gradient(to top, var(--bg-surface) 0%, var(--bg-surface) 48%, transparent 100%)',
          }}
        >
          <p className="gb-display m-0 text-[30px] italic leading-tight">
            «Ayuda a tus piezas para que ellas te ayuden a ti.»
          </p>
          <span className="mt-4 block text-[13px]" style={{ color: 'var(--text-muted)' }}>
            Paul Morphy
          </span>
        </div>
      </aside>

      <section className="flex flex-1 flex-col justify-center gap-6 px-5 py-10 sm:px-16 lg:px-24">
        <div className="lg:hidden">
          <Logo size={26} />
        </div>

        <div
          className="flex w-[280px] gap-1.5 rounded-xl p-1.5"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          role="tablist"
        >
          {(['register', 'login'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => {
                setMode(value);
                setError(null);
              }}
              className="h-10 flex-1 rounded-lg text-sm"
              style={
                mode === value
                  ? { background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 600, border: 'none' }
                  : { background: 'transparent', color: 'var(--text-muted)', border: 'none' }
              }
            >
              {value === 'register' ? 'Crear cuenta' : 'Entrar'}
            </button>
          ))}
        </div>

        <div>
          <h1 className="gb-display m-0 text-[44px] leading-tight">Sentate al tablero</h1>
          <p className="mt-2 text-[15px]" style={{ color: 'var(--text-muted)' }}>
            Tu rating arranca en 1500 y se calibra con las primeras diez partidas.
          </p>
        </div>

        {params.get('error') === 'oauth' ? (
          <p
            className="rounded-xl px-4 py-3 text-[13px]"
            style={{ background: 'var(--danger-wash)', border: '1px solid var(--danger-wash-border)', color: 'var(--danger)' }}
          >
            No se pudo completar el acceso con Google. Probá de nuevo o entrá con tu correo.
          </p>
        ) : null}

        {providers.data?.google ? (
          <div className="flex flex-col gap-3">
            <a href="/api/auth/google" className="gb-btn gb-btn--primary gb-btn--block" style={{ height: 58, fontSize: 16 }}>
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full"
                style={{ background: 'var(--accent-ink)', color: 'var(--accent)', fontFamily: 'var(--font-display)', fontWeight: 700 }}
                aria-hidden="true"
              >
                G
              </span>
              Continuar con Google
            </a>
            <p className="m-0 text-[12px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Pedimos sólo tu correo y tu nombre. Después elegís tu nombre de jugador, que es lo
              único que ve el resto de la plataforma.
            </p>
          </div>
        ) : null}

        {providers.data?.google ? (
          <div className="flex items-center gap-4">
            <span className="h-px flex-1" style={{ background: 'var(--border)' }} />
            <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              o con tu correo
            </span>
            <span className="h-px flex-1" style={{ background: 'var(--border)' }} />
          </div>
        ) : null}

        <form className="flex flex-col gap-4" onSubmit={submit}>
          {mode === 'register' ? (
            <>
              <Field
                label="Nombre de jugador"
                autoComplete="username"
                value={values.username}
                error={apiError?.fieldError('username') ?? (apiError?.code === 'USERNAME_TAKEN' ? apiError.message : null)}
                onChange={(e) => setValues((v) => ({ ...v, username: e.target.value }))}
              />
              <Field
                label="Correo electrónico"
                type="email"
                autoComplete="email"
                placeholder="tu@correo.com"
                value={values.email}
                error={apiError?.fieldError('email') ?? (apiError?.code === 'EMAIL_TAKEN' ? apiError.message : null)}
                onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
              />
            </>
          ) : (
            <Field
              label="Correo o nombre de jugador"
              autoComplete="username"
              value={values.identifier}
              onChange={(e) => setValues((v) => ({ ...v, identifier: e.target.value }))}
            />
          )}

          <Field
            label="Contraseña"
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            value={values.password}
            hint={mode === 'register' ? 'Mínimo 10 caracteres' : undefined}
            error={apiError?.fieldError('password') ?? (apiError?.code === 'BAD_CREDENTIALS' ? apiError.message : null)}
            onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
          />

          {error && !apiError?.fields && !['USERNAME_TAKEN', 'EMAIL_TAKEN', 'BAD_CREDENTIALS'].includes(apiError?.code ?? '') ? (
            <p className="m-0 text-[13px]" style={{ color: 'var(--danger)' }}>
              {error.message}
            </p>
          ) : null}

          <Button
            type="submit"
            variant={providers.data?.google ? 'secondary' : 'primary'}
            block
            disabled={busy}
            style={{ height: 52 }}
          >
            {busy ? 'Un momento…' : mode === 'register' ? 'Crear cuenta con correo' : 'Entrar'}
          </Button>
        </form>
      </section>
    </div>
  );
}
