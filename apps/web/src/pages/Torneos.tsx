import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@gambito/ui';
import { FORMATO_LABEL, type Formato } from '@gambito/tournament';
import { CATEGORY_LABEL, type Category } from '@gambito/shared';
import { get } from '../api/client.js';

interface TorneoResumen {
  id: string;
  name: string;
  description: string | null;
  format: Formato;
  category: Category;
  initialSec: number;
  incrementSec: number;
  rounds: number | null;
  durationMin: number | null;
  currentRound: number;
  status: 'SCHEDULED' | 'RUNNING' | 'FINISHED' | 'CANCELLED';
  startsAt: string;
  minRating: number | null;
  maxRating: number | null;
  maxPlayers: number | null;
  createdBy: { username: string | null };
  _count: { entries: number };
}

const ESTADO_TEXTO: Record<TorneoResumen['status'], { texto: string; color: string }> = {
  SCHEDULED: { texto: 'PRÓXIMO', color: 'var(--cool)' },
  RUNNING: { texto: 'EN CURSO', color: 'var(--danger)' },
  FINISHED: { texto: 'FINALIZADO', color: 'var(--text-muted)' },
  CANCELLED: { texto: 'CANCELADO', color: 'var(--text-muted)' },
};

function cuando(iso: string): string {
  const fecha = new Date(iso);
  const minutos = Math.round((fecha.getTime() - Date.now()) / 60000);
  if (minutos < -60) return fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  if (minutos < 0) return 'ya empezó';
  if (minutos < 60) return `en ${minutos} min`;
  if (minutos < 60 * 24) return `en ${Math.round(minutos / 60)} h`;
  return fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function Torneos() {
  const [estado, setEstado] = useState<'activos' | 'finalizados'>('activos');

  const consulta = useQuery({
    queryKey: ['torneos', estado],
    queryFn: () => get<{ torneos: TorneoResumen[] }>(`/tournaments?estado=${estado}`),
  });

  const torneos = consulta.data?.torneos ?? [];
  const destacado = torneos.find((t) => t.status === 'RUNNING') ?? null;
  const resto = torneos.filter((t) => t !== destacado);

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-5 py-8 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="gb-display m-0 text-[40px] leading-none">Torneos</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            Suizo, arena o eliminación directa. Entrás con un clic; el emparejamiento lo hace
            el servidor.
          </p>
        </div>
        <Link to="/torneos/crear" className="gb-btn gb-btn--primary">Crear torneo</Link>
      </div>

      <div
        className="flex w-fit gap-1.5 rounded-xl p-1.5"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        role="tablist"
      >
        {([['activos', 'En curso y próximos'], ['finalizados', 'Finalizados']] as const).map(
          ([valor, etiqueta]) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={estado === valor}
              onClick={() => setEstado(valor)}
              className="h-10 rounded-lg px-4 text-[13px]"
              style={
                estado === valor
                  ? { background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 600, border: 'none' }
                  : { background: 'transparent', color: 'var(--text-muted)', border: 'none' }
              }
            >
              {etiqueta}
            </button>
          ),
        )}
      </div>

      {consulta.isLoading ? (
        <div className="flex justify-center py-10"><Spinner label="Cargando torneos…" /></div>
      ) : null}

      {destacado ? (
        <Link
          to={`/torneos/${destacado.id}`}
          className="flex flex-wrap items-center gap-7 rounded-2xl p-7"
          style={{ background: 'var(--accent-wash)', border: '1px solid var(--accent)', color: 'var(--text-primary)' }}
        >
          <div className="flex flex-1 flex-col gap-2">
            <span className="flex items-center gap-2">
              <span className="block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--danger)' }} />
              <span className="gb-mono text-[11px] tracking-[0.15em]" style={{ color: 'var(--danger)' }}>
                EN CURSO
                {destacado.rounds ? ` · RONDA ${destacado.currentRound} DE ${destacado.rounds}` : ''}
              </span>
            </span>
            <span className="gb-display text-[34px] leading-tight">{destacado.name}</span>
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {FORMATO_LABEL[destacado.format]} {destacado.initialSec / 60}+{destacado.incrementSec}
              {' · '}{destacado._count.entries} inscriptos
              {destacado.createdBy.username ? ` · organiza ${destacado.createdBy.username}` : ''}
            </span>
          </div>
          <span className="gb-btn gb-btn--primary">Entrar a la sala</span>
        </Link>
      ) : null}

      {!consulta.isLoading && torneos.length === 0 ? (
        <div className="gb-card text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
          {estado === 'activos'
            ? 'No hay torneos programados. Creá el primero.'
            : 'Todavía no terminó ningún torneo.'}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {resto.map((torneo) => (
          <Link
            key={torneo.id}
            to={`/torneos/${torneo.id}`}
            className="gb-card flex flex-col gap-3"
            style={{ color: 'var(--text-primary)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="gb-mono text-[11px] tracking-[0.13em]"
                style={{ color: ESTADO_TEXTO[torneo.status].color }}
              >
                {torneo.status === 'SCHEDULED'
                  ? cuando(torneo.startsAt).toUpperCase()
                  : ESTADO_TEXTO[torneo.status].texto}
              </span>
              <span
                className="rounded-md px-2 py-1 text-[11px]"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              >
                {FORMATO_LABEL[torneo.format]}
              </span>
            </div>
            <span className="gb-display text-[24px] leading-tight">{torneo.name}</span>
            {torneo.description ? (
              <span className="text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {torneo.description}
              </span>
            ) : null}
            <span className="h-px" style={{ background: 'var(--border)' }} />
            <div className="flex items-end justify-between">
              <div className="flex flex-col gap-1">
                <span className="gb-mono text-[13px]">
                  {CATEGORY_LABEL[torneo.category]} {torneo.initialSec / 60}+{torneo.incrementSec}
                  {torneo.rounds ? ` · ${torneo.rounds} rondas` : ''}
                  {torneo.durationMin ? ` · ${torneo.durationMin} min` : ''}
                </span>
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {torneo._count.entries} inscriptos
                  {torneo.maxPlayers ? ` de ${torneo.maxPlayers}` : ''}
                  {torneo.minRating || torneo.maxRating
                    ? ` · ${torneo.minRating ?? '—'}–${torneo.maxRating ?? '—'}`
                    : ''}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
