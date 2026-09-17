import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, Spinner } from '@gambito/ui';
import { FORMATO_LABEL, type Formato } from '@gambito/tournament';
import { CATEGORY_LABEL, type Category } from '@gambito/shared';
import { get, post } from '../api/client.js';
import { useSession } from '../state/session.js';
import { useSocket } from '../state/socket.js';

interface FilaClasificacion {
  posicion: number;
  userId: string;
  username: string | null;
  avatarUrl: string | null;
  puntos: number;
  partidas: number;
  racha: number;
  rating: number;
  retirado: boolean;
  eliminado: boolean;
  desempates: { buchholz: number; sonnebornBerger: number } | null;
}

interface Cruce {
  board: number;
  isBye: boolean;
  white: { id: string; username: string | null } | null;
  black: { id: string; username: string | null } | null;
  bye: { id: string; username: string | null } | null;
  result: 'WHITE' | 'BLACK' | 'DRAW' | null;
  gameId: string | null;
  enJuego: boolean;
}

interface Detalle {
  torneo: {
    id: string;
    name: string;
    description: string | null;
    format: Formato;
    category: Category;
    initialSec: number;
    incrementSec: number;
    rounds: number | null;
    currentRound: number;
    status: 'SCHEDULED' | 'RUNNING' | 'FINISHED' | 'CANCELLED';
    startsAt: string;
    minRating: number | null;
    maxRating: number | null;
    createdById: string;
    createdBy: { username: string | null };
    _count: { entries: number };
  };
  clasificacion: FilaClasificacion[];
  rondas: Array<{ ronda: number; cruces: Cruce[] }>;
  yo: { inscripto: boolean; eliminado: boolean };
}

export function TorneoSala() {
  const { id = '' } = useParams();
  const { user } = useSession();
  const { socket } = useSocket();
  const queryClient = useQueryClient();

  const consulta = useQuery({
    queryKey: ['torneo', id],
    queryFn: () => get<Detalle>(`/tournaments/${id}`),
    enabled: id.length > 0,
  });

  // La clasificación se refresca por aviso del servidor, no por sondeo: el
  // torneo avisa cuando cambia algo y recién ahí se vuelve a pedir.
  useEffect(() => {
    if (!socket || !id) return;
    socket.emit('tournament:watch', { tournamentId: id });
    const alActualizar = () => {
      void queryClient.invalidateQueries({ queryKey: ['torneo', id] });
    };
    socket.on('tournament:update', alActualizar);
    return () => {
      socket.off('tournament:update', alActualizar);
      socket.emit('tournament:unwatch', { tournamentId: id });
    };
  }, [socket, id, queryClient]);

  const inscribirse = useMutation({
    mutationFn: () => post(`/tournaments/${id}/join`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['torneo', id] }),
  });
  const retirarse = useMutation({
    mutationFn: () => post(`/tournaments/${id}/leave`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['torneo', id] }),
  });
  const empezar = useMutation({
    mutationFn: () => post(`/tournaments/${id}/start`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['torneo', id] }),
  });

  if (consulta.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner label="Cargando el torneo…" />
      </div>
    );
  }
  if (!consulta.data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span style={{ color: 'var(--text-muted)' }}>No se encontró ese torneo.</span>
      </div>
    );
  }

  const { torneo, clasificacion, rondas, yo } = consulta.data;
  const esOrganizador = user?.id === torneo.createdById;
  const enCurso = torneo.status === 'RUNNING';
  const termino = torneo.status === 'FINISHED' || torneo.status === 'CANCELLED';

  // La partida propia de la ronda en curso, para el atajo de "ir a jugar".
  const miCruce = rondas[0]?.cruces.find(
    (cruce) => cruce.white?.id === user?.id || cruce.black?.id === user?.id,
  );

  return (
    <div className="mx-auto flex w-full max-w-[1300px] flex-col gap-5 px-5 py-8 sm:px-8">
      {/* Cabecera */}
      <section
        className="flex flex-wrap items-center gap-8 rounded-2xl p-7"
        style={{
          background: enCurso ? 'var(--accent-wash)' : 'var(--bg-surface)',
          border: `1px solid ${enCurso ? 'var(--accent)' : 'var(--border)'}`,
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="flex items-center gap-2">
            {enCurso ? (
              <span className="block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--danger)' }} />
            ) : null}
            <span
              className="gb-mono text-[11px] tracking-[0.15em]"
              style={{ color: enCurso ? 'var(--danger)' : 'var(--text-muted)' }}
            >
              {enCurso
                ? `EN CURSO${torneo.rounds ? ` · RONDA ${torneo.currentRound} DE ${torneo.rounds}` : ''}`
                : termino
                  ? 'FINALIZADO'
                  : `EMPIEZA ${new Date(torneo.startsAt).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
            </span>
          </span>
          <h1 className="gb-display m-0 text-[36px] leading-tight">{torneo.name}</h1>
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {FORMATO_LABEL[torneo.format]} · {CATEGORY_LABEL[torneo.category]}{' '}
            {torneo.initialSec / 60}+{torneo.incrementSec} · {torneo._count.entries} inscriptos
            {torneo.minRating || torneo.maxRating
              ? ` · ${torneo.minRating ?? '—'}–${torneo.maxRating ?? '—'}`
              : ''}
            {torneo.createdBy.username ? ` · organiza ${torneo.createdBy.username}` : ''}
          </span>
          {torneo.description ? (
            <p className="m-0 max-w-[70ch] text-[13px]" style={{ color: 'var(--text-muted)' }}>
              {torneo.description}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {miCruce?.gameId && miCruce.enJuego ? (
            <Link to={`/partida/${miCruce.gameId}`} className="gb-btn gb-btn--primary">
              Ir a mi partida
            </Link>
          ) : null}
          {!termino && !yo.inscripto ? (
            <Button variant="primary" disabled={inscribirse.isPending} onClick={() => inscribirse.mutate()}>
              {inscribirse.isPending ? 'Inscribiendo…' : 'Inscribirme'}
            </Button>
          ) : null}
          {!termino && yo.inscripto ? (
            <Button disabled={retirarse.isPending} onClick={() => retirarse.mutate()}>
              Retirarme
            </Button>
          ) : null}
          {esOrganizador && torneo.status === 'SCHEDULED' ? (
            <Button variant="primary" disabled={empezar.isPending} onClick={() => empezar.mutate()}>
              Empezar ahora
            </Button>
          ) : null}
        </div>
      </section>

      {inscribirse.isError ? (
        <div
          className="rounded-xl px-4 py-3 text-[13px]"
          style={{ background: 'var(--danger-wash)', border: '1px solid var(--danger-wash-border)', color: 'var(--danger)' }}
          role="status"
        >
          {inscribirse.error instanceof Error ? inscribirse.error.message : 'No se pudo inscribir.'}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_1.15fr]">
        {/* Clasificación */}
        <section
          className="flex flex-col overflow-hidden rounded-2xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-baseline justify-between px-6 pb-3.5 pt-5">
            <h2 className="gb-display m-0 text-[22px]">Clasificación</h2>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {enCurso ? 'en vivo' : ''}
            </span>
          </div>
          <div
            className="grid gap-3 px-6 pb-2.5"
            style={{ gridTemplateColumns: '34px 1fr 52px 62px', borderBottom: '1px solid var(--border)' }}
          >
            {['#', 'JUGADOR', 'PTS', torneo.format === 'ARENA' ? 'PJ' : 'BUCH'].map((titulo, i) => (
              <span
                key={titulo}
                className="gb-mono text-[10px] tracking-[0.1em]"
                style={{ color: 'var(--text-muted)', textAlign: i >= 2 ? 'right' : 'left' }}
              >
                {titulo}
              </span>
            ))}
          </div>
          {clasificacion.length === 0 ? (
            <span className="px-6 py-6 text-[13px]" style={{ color: 'var(--text-muted)' }}>
              Todavía no se inscribió nadie.
            </span>
          ) : null}
          {clasificacion.map((fila) => (
            <div
              key={fila.userId}
              className="grid items-center gap-3 px-6 py-2.5"
              style={{
                gridTemplateColumns: '34px 1fr 52px 62px',
                borderTop: '1px solid var(--bg-elevated)',
                background: fila.userId === user?.id ? 'var(--accent-wash)' : 'transparent',
                opacity: fila.retirado ? 0.5 : 1,
              }}
            >
              <span className="gb-mono text-[13px]" style={{ color: 'var(--text-muted)' }}>
                {fila.posicion}
              </span>
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar username={fila.username} url={fila.avatarUrl} size={26} />
                <Link
                  to={`/perfil/${fila.username}`}
                  className="truncate text-[13px]"
                  style={{ color: fila.userId === user?.id ? 'var(--accent)' : 'var(--text-primary)' }}
                >
                  {fila.username}
                </Link>
                {fila.eliminado ? (
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>eliminado</span>
                ) : null}
                {fila.racha >= 3 ? (
                  <span className="gb-mono text-[10px]" style={{ color: 'var(--accent-text)' }}>
                    ×{fila.racha}
                  </span>
                ) : null}
              </span>
              <span className="gb-mono text-right text-[14px] font-bold">{fila.puntos}</span>
              <span className="gb-mono text-right text-[12px]" style={{ color: 'var(--text-muted)' }}>
                {torneo.format === 'ARENA' ? fila.partidas : (fila.desempates?.buchholz ?? 0)}
              </span>
            </div>
          ))}
        </section>

        {/* Emparejamientos */}
        <section
          className="flex flex-col overflow-hidden rounded-2xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-baseline justify-between px-6 pb-3.5 pt-5">
            <h2 className="gb-display m-0 text-[22px]">
              {torneo.format === 'ARENA' ? 'Partidas' : 'Emparejamientos'}
            </h2>
          </div>

          {rondas.length === 0 ? (
            <span className="px-6 py-6 text-[13px]" style={{ color: 'var(--text-muted)' }}>
              El torneo todavía no empezó.
            </span>
          ) : null}

          <div className="flex flex-col gap-5 px-4 pb-5">
            {rondas.slice(0, 4).map(({ ronda, cruces }) => (
              <div key={ronda} className="flex flex-col gap-1.5">
                <span
                  className="gb-mono px-2 text-[11px] tracking-[0.13em]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {torneo.format === 'ARENA' ? `TANDA ${ronda}` : `RONDA ${ronda}`}
                </span>
                {cruces.map((cruce) => {
                  const esMio = cruce.white?.id === user?.id || cruce.black?.id === user?.id || cruce.bye?.id === user?.id;
                  const contenido = (
                    <>
                      <span className="gb-mono text-[12px]" style={{ color: 'var(--text-muted)' }}>
                        {cruce.board}
                      </span>
                      {cruce.isBye ? (
                        <span className="col-span-3 text-[13px]" style={{ color: 'var(--text-muted)' }}>
                          {cruce.bye?.username} descansa esta ronda
                        </span>
                      ) : (
                        <>
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className="block h-3 w-3 shrink-0 rounded-[3px]"
                              style={{ background: 'var(--board-light)' }}
                            />
                            <span className="truncate text-[13px]">{cruce.white?.username}</span>
                          </span>
                          <span
                            className="gb-mono text-center text-[12px]"
                            style={{ color: cruce.enJuego ? 'var(--accent)' : 'var(--text-muted)' }}
                          >
                            {cruce.result === 'WHITE'
                              ? '1-0'
                              : cruce.result === 'BLACK'
                                ? '0-1'
                                : cruce.result === 'DRAW'
                                  ? '½-½'
                                  : cruce.enJuego
                                    ? 'jugando'
                                    : '—'}
                          </span>
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className="block h-3 w-3 shrink-0 rounded-[3px]"
                              style={{ background: 'var(--board-dark)' }}
                            />
                            <span className="truncate text-[13px]">{cruce.black?.username}</span>
                          </span>
                        </>
                      )}
                    </>
                  );

                  const estilo = {
                    gridTemplateColumns: '28px 1fr 64px 1fr',
                    background: esMio ? 'var(--accent-wash)' : 'var(--bg-elevated)',
                    border: `1px solid ${esMio ? 'var(--accent)' : 'var(--border)'}`,
                    color: 'var(--text-primary)',
                  } as const;

                  return cruce.gameId ? (
                    <Link
                      key={`${ronda}-${cruce.board}`}
                      to={cruce.enJuego ? `/partida/${cruce.gameId}` : `/analisis/${cruce.gameId}`}
                      className="grid items-center gap-2 rounded-[10px] px-3 py-2.5"
                      style={estilo}
                    >
                      {contenido}
                    </Link>
                  ) : (
                    <div
                      key={`${ronda}-${cruce.board}`}
                      className="grid items-center gap-2 rounded-[10px] px-3 py-2.5"
                      style={estilo}
                    >
                      {contenido}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
