import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PRESET_TIME_CONTROLS, categoryFor, formatTimeControl, CATEGORY_LABEL, type Category, type TimeControl } from '@gambito/shared';
import { get } from '../api/client.js';
import { useSession } from '../state/session.js';
import { PanelAmigos, PanelDesafios } from '../components/Social.js';

interface LiveGame {
  id: string;
  category: Category;
  initialSec: number;
  incrementSec: number;
  white: { username: string | null };
  black: { username: string | null };
  _count: { moves: number };
}

const ORDER: Category[] = ['BULLET', 'BLITZ', 'RAPID', 'CLASSICAL'];

export function Lobby() {
  const navigate = useNavigate();
  const { user } = useSession();

  const live = useQuery({
    queryKey: ['live'],
    queryFn: () => get<{ games: LiveGame[] }>('/games/live'),
    refetchInterval: 5_000,
  });

  const grouped = ORDER.map((category) => ({
    category,
    controls: PRESET_TIME_CONTROLS.filter((tc) => categoryFor(tc) === category),
  }));

  function play(tc: TimeControl) {
    navigate(`/buscar?t=${tc.initialSec}&i=${tc.incrementSec}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-7 px-5 py-8 sm:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="gb-display m-0 text-[38px] leading-tight">Buenas, {user?.username}</h1>
          <p className="mt-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
            Elegí un control de tiempo y el servidor te busca rival.
          </p>
        </div>
        <Link to="/practica" className="gb-btn gb-btn--secondary">
          Practicar contra la IA
        </Link>
      </div>

      <section className="flex flex-col gap-3.5">
        <span className="gb-mono text-[11px] tracking-[0.16em]" style={{ color: 'var(--text-muted)' }}>
          PARTIDA CLASIFICATORIA
        </span>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {grouped.map(({ category, controls }) => (
            <div key={category} className="gb-card flex flex-col gap-4">
              <span className="gb-display text-[26px]">{CATEGORY_LABEL[category]}</span>
              <div className="flex flex-wrap gap-2">
                {controls.map((tc) => (
                  <button
                    key={formatTimeControl(tc)}
                    type="button"
                    onClick={() => play(tc)}
                    className="gb-mono h-11 min-w-[74px] flex-1 rounded-[9px] text-sm"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  >
                    {formatTimeControl(tc)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <PanelDesafios />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <section className="flex flex-col gap-3.5">
        <div className="flex items-baseline justify-between">
          <h2 className="gb-display m-0 text-[22px]">Partidas en vivo</h2>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {live.data?.games.length ?? 0} en curso
          </span>
        </div>
        <div className="gb-card flex flex-col gap-2.5">
          {live.isLoading ? (
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Cargando…</span>
          ) : live.data?.games.length ? (
            live.data.games.map((game) => (
              <button
                key={game.id}
                type="button"
                onClick={() => navigate(`/partida/${game.id}`)}
                className="flex items-center gap-3 rounded-[11px] px-3.5 py-3 text-left"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
              >
                <span className="flex-1 text-sm">
                  {game.white.username} vs {game.black.username}
                </span>
                <span className="gb-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                  {CATEGORY_LABEL[game.category]} {game.initialSec / 60}+{game.incrementSec} ·{' '}
                  jugada {Math.ceil(game._count.moves / 2) || 1}
                </span>
              </button>
            ))
          ) : (
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Todavía no hay partidas en curso. Empezá vos.
            </span>
          )}
        </div>
      </section>

      <PanelAmigos />
      </div>
    </div>
  );
}
