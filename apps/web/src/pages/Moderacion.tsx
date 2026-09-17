import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Field, Spinner } from '@gambito/ui';
import type { Role } from '@gambito/shared';
import { get, post } from '../api/client.js';

/**
 * Panel de moderación.
 *
 * Todavía no hay denuncias, así que el panel no finge una cola: busca una
 * cuenta y la suspende. Es lo único que se puede moderar sin un mecanismo de
 * reporte, y al menos se aplica de verdad —la suspensión corta las sesiones
 * abiertas y bloquea la reconexión del socket—.
 */

interface Cuenta {
  id: string;
  username: string | null;
  email: string;
  role: Role;
  country: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  suspendedAt: string | null;
  suspendedFor: string | null;
  partidas: number;
}

function fecha(valor: string | null): string {
  if (!valor) return '—';
  return new Date(valor).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function Moderacion() {
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [motivos, setMotivos] = useState<Record<string, string>>({});

  const consulta = useQuery({
    queryKey: ['moderacion', busqueda],
    queryFn: () => get<{ usuarios: Cuenta[] }>(`/admin/users?q=${encodeURIComponent(busqueda)}`),
  });

  const suspender = useMutation({
    mutationFn: ({ username, motivo }: { username: string; motivo: string }) =>
      post(`/admin/users/${encodeURIComponent(username)}/suspend`, { motivo }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['moderacion'] }),
  });

  const levantar = useMutation({
    mutationFn: (username: string) => post(`/admin/users/${encodeURIComponent(username)}/unsuspend`, {}),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['moderacion'] }),
  });

  const usuarios = consulta.data?.usuarios ?? [];

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-1 flex-col gap-5 px-4 py-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <h1 className="gb-display m-0 text-[28px]">Moderación</h1>
        <p className="m-0 text-[13px]" style={{ color: 'var(--text-muted)' }}>
          Suspender una cuenta la desconecta en el acto y le impide volver a entrar.
        </p>
      </header>

      <Field
        label="Buscar por nombre de jugador"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Vacío lista las cuentas más nuevas"
      />

      {consulta.isLoading ? (
        <Spinner label="Buscando…" />
      ) : usuarios.length === 0 ? (
        <p className="m-0 text-[13px]" style={{ color: 'var(--text-muted)' }}>
          Ninguna cuenta coincide.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {usuarios.map((cuenta) => {
            const nombre = cuenta.username ?? '';
            const suspendida = cuenta.suspendedAt !== null;
            return (
              <li key={cuenta.id} className="gb-card flex flex-col gap-3" data-testid={`cuenta-${nombre}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="gb-display text-[17px]">{nombre || '(sin nombre)'}</span>
                    <span className="truncate text-[12px]" style={{ color: 'var(--text-muted)' }}>
                      {cuenta.email} · {cuenta.partidas} partidas · alta {fecha(cuenta.createdAt)}
                    </span>
                  </div>
                  <span
                    className="gb-mono shrink-0 text-[11px] tracking-[0.1em]"
                    style={{ color: suspendida ? 'var(--danger)' : 'var(--text-muted)' }}
                  >
                    {suspendida ? 'SUSPENDIDA' : cuenta.role}
                  </span>
                </div>

                {suspendida ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px]" style={{ color: 'var(--danger)' }}>
                      {cuenta.suspendedFor}
                    </span>
                    <Button
                      onClick={() => levantar.mutate(nombre)}
                      disabled={levantar.isPending}
                    >
                      Levantar suspensión
                    </Button>
                  </div>
                ) : cuenta.role === 'ADMIN' ? (
                  <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                    A un administrador no se lo puede suspender desde acá.
                  </span>
                ) : (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[220px] flex-1">
                      <Field
                        id={`motivo-${cuenta.id}`}
                        label="Motivo"
                        value={motivos[cuenta.id] ?? ''}
                        onChange={(e) => setMotivos((p) => ({ ...p, [cuenta.id]: e.target.value }))}
                        placeholder="Trampa con motor en partidas clasificatorias"
                      />
                    </div>
                    <Button
                      variant="danger"
                      disabled={(motivos[cuenta.id] ?? '').trim().length < 3 || suspender.isPending}
                      onClick={() =>
                        suspender.mutate({ username: nombre, motivo: (motivos[cuenta.id] ?? '').trim() })
                      }
                    >
                      Suspender
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
