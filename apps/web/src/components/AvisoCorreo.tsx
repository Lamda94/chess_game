import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSession } from '../state/session.js';
import { post } from '../api/client.js';

/**
 * Franja que recuerda confirmar el correo.
 *
 * No bloquea nada: quien no lo confirma juega igual. Lo que se pierde es la
 * recuperación de contraseña, y eso es lo que dice el texto — un aviso que no
 * explica qué se pierde se ignora.
 */
export function AvisoCorreo() {
  const { user } = useSession();
  const [oculto, setOculto] = useState(false);

  const reenviar = useMutation({
    mutationFn: () => post('/auth/verify-email/send', {}),
  });

  if (!user || user.emailVerified || oculto) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-5 py-2.5 text-[13px] sm:px-10"
      style={{
        background: 'var(--accent-wash)',
        borderBottom: '1px solid var(--accent-wash-border)',
        color: 'var(--accent-text)',
      }}
    >
      {reenviar.isSuccess ? (
        <span>Listo, te mandamos otro correo a {user.email}. Revisá también el correo no deseado.</span>
      ) : (
        <>
          <span>
            Confirmá tu correo ({user.email}) para poder recuperar la contraseña si la perdés.
          </span>
          <button
            type="button"
            onClick={() => reenviar.mutate()}
            disabled={reenviar.isPending}
            className="underline"
            style={{ background: 'none', border: 'none', padding: 0, color: 'inherit', cursor: 'pointer', font: 'inherit' }}
          >
            {reenviar.isPending ? 'Mandando…' : 'Reenviar el correo'}
          </button>
        </>
      )}
      <button
        type="button"
        aria-label="Ocultar el aviso"
        onClick={() => setOculto(true)}
        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', font: 'inherit', padding: '0 4px' }}
      >
        ✕
      </button>
    </div>
  );
}
