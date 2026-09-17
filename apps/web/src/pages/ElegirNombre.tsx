import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Button, Field } from '@gambito/ui';
import { usernameSchema } from '@gambito/shared';
import { ApiError, get } from '../api/client.js';
import { useSession } from '../state/session.js';
import { Logo } from '../components/Logo.js';

/** Paso que sigue al alta con Google: el proveedor no nos da un nombre de jugador. */
export function ElegirNombre() {
  const { user, chooseUsername } = useSession();
  const [username, setUsername] = useState('');
  const [check, setCheck] = useState<{ available: boolean; reason: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const local = usernameSchema.safeParse(username);

  useEffect(() => {
    if (!local.success) {
      setCheck(null);
      return;
    }
    // Se espera a que deje de tipear para no consultar en cada tecla.
    const timer = setTimeout(() => {
      void get<{ available: boolean; reason: string | null }>(
        `/auth/username-available?username=${encodeURIComponent(username)}`,
      )
        .then(setCheck)
        .catch(() => setCheck(null));
    }, 350);
    return () => clearTimeout(timer);
  }, [username, local.success]);

  if (!user) return <Navigate to="/entrar" replace />;
  if (!user.needsUsername) return <Navigate to="/" replace />;

  const localError = username.length > 0 && !local.success ? local.error.issues[0]?.message : null;
  const takenError = check && !check.available ? check.reason : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await chooseUsername(username);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'No se pudo guardar el nombre.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="gb-card flex w-full max-w-[520px] flex-col gap-6" style={{ padding: 40 }}>
        <Logo size={30} />
        <div>
          <h1 className="gb-display m-0 text-[38px] leading-tight">Elegí tu nombre</h1>
          <p className="mt-2 text-[15px]" style={{ color: 'var(--text-muted)' }}>
            Entraste como <strong style={{ color: 'var(--text-primary)' }}>{user.email}</strong>. Tu
            nombre de jugador es lo único que ve el resto: aparece en el ranking, en las partidas y
            en los torneos. No se puede cambiar después.
          </p>
        </div>

        <form className="flex flex-col gap-5" onSubmit={submit}>
          <Field
            label="Nombre de jugador"
            value={username}
            autoFocus
            autoComplete="off"
            onChange={(event) => setUsername(event.target.value)}
            error={localError ?? takenError ?? error}
            valid={check?.available === true}
            hint={
              check?.available
                ? 'Disponible'
                : 'Entre 3 y 20 caracteres: letras, números y guión bajo'
            }
          />
          <Button
            type="submit"
            variant="primary"
            block
            style={{ height: 52 }}
            disabled={busy || !local.success || check?.available !== true}
          >
            {busy ? 'Guardando…' : 'Empezar a jugar'}
          </Button>
        </form>
      </div>
    </div>
  );
}
