import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Button, Spinner } from '@gambito/ui';
import { CATEGORIES, CATEGORY_LABEL, type Category } from '@gambito/shared';
import { get } from '../api/client.js';
import { useSession } from '../state/session.js';

interface Fila {
  posicion: number;
  username: string;
  avatarUrl: string | null;
  country: string | null;
  rating: number;
  peak: number;
  gamesPlayed: number;
  provisional: boolean;
}

interface Tabla {
  category: Category;
  filas: Fila[];
  total: number;
  pagina: number;
  paginas?: number;
  busqueda: string | null;
}

export function Ranking() {
  const { user } = useSession();
  const [categoria, setCategoria] = useState<Category>('BLITZ');
  const [pagina, setPagina] = useState(0);
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');

  // Se espera a que deje de tipear para no consultar en cada tecla.
  useEffect(() => {
    const temporizador = setTimeout(() => setBusqueda(texto.trim()), 300);
    return () => clearTimeout(temporizador);
  }, [texto]);

  useEffect(() => setPagina(0), [categoria, busqueda]);

  const tabla = useQuery({
    queryKey: ['ranking', categoria, pagina, busqueda],
    queryFn: () =>
      get<Tabla>(
        `/leaderboard?category=${categoria}&page=${pagina}` +
          (busqueda ? `&q=${encodeURIComponent(busqueda)}` : ''),
      ),
    placeholderData: (previo) => previo,
  });

  const mio = useQuery({
    queryKey: ['ranking-mio', categoria],
    queryFn: () => get<{ fila: Fila | null }>(`/leaderboard/me?category=${categoria}`),
    enabled: Boolean(user),
  });

  const filas = tabla.data?.filas ?? [];
  const podio = !busqueda && pagina === 0 ? filas.slice(0, 3) : [];
  const resto = podio.length > 0 ? filas.slice(3) : filas;

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-5 py-8 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="gb-display m-0 text-[40px] leading-none">Tabla de posiciones</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            Glicko-2 por modalidad. Entran las cuentas con el rating ya calibrado, a partir de
            diez partidas.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex flex-wrap gap-1.5 rounded-xl p-1.5"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          role="tablist"
        >
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={c === categoria}
              onClick={() => setCategoria(c)}
              className="h-10 rounded-lg px-4 text-[13px]"
              style={
                c === categoria
                  ? { background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 600, border: 'none' }
                  : { background: 'transparent', color: 'var(--text-muted)', border: 'none' }
              }
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <label htmlFor="buscar" className="sr-only">Buscar jugador</label>
        <input
          id="buscar"
          type="search"
          className="gb-input"
          style={{ width: 260, height: 44 }}
          placeholder="Buscar jugador…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
      </div>

      {tabla.isLoading ? (
        <div className="flex justify-center py-10"><Spinner label="Cargando la tabla…" /></div>
      ) : null}

      {/* Podio */}
      {podio.length === 3 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[podio[1]!, podio[0]!, podio[2]!].map((fila) => {
            const primero = fila.posicion === 1;
            return (
              <Link
                key={fila.username}
                to={`/perfil/${fila.username}`}
                className="gb-card flex flex-col items-center gap-2.5"
                style={{
                  borderColor: primero ? 'var(--accent)' : 'var(--border)',
                  background: primero ? 'var(--accent-wash)' : 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  paddingBlock: primero ? 30 : 22,
                }}
              >
                <span className="gb-mono text-xs" style={{ color: primero ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {fila.posicion}
                </span>
                <Avatar username={fila.username} url={fila.avatarUrl} size={primero ? 70 : 56} />
                <span className="text-base">{fila.username}</span>
                <span
                  className="gb-mono text-[30px] font-bold leading-none"
                  style={{ color: primero ? 'var(--accent)' : 'var(--text-primary)' }}
                >
                  {fila.rating}
                </span>
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {fila.country ? `${fila.country} · ` : ''}
                  {fila.gamesPlayed.toLocaleString('es-AR')} partidas
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}

      {/* Tabla */}
      <section
        className="flex flex-col overflow-hidden rounded-2xl"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <div
          className="grid items-center gap-4 px-6 py-3.5"
          style={{ gridTemplateColumns: '64px 1fr 110px 100px 110px', borderBottom: '1px solid var(--border)' }}
        >
          {['#', 'JUGADOR', 'RATING', 'PICO', 'PARTIDAS'].map((titulo, indice) => (
            <span
              key={titulo}
              className="gb-mono text-[11px] tracking-[0.12em]"
              style={{ color: 'var(--text-muted)', textAlign: indice >= 2 ? 'right' : 'left' }}
            >
              {titulo}
            </span>
          ))}
        </div>

        {resto.length === 0 && !tabla.isLoading ? (
          <span className="px-6 py-8 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
            {busqueda
              ? `No hay ningún jugador que coincida con «${busqueda}».`
              : 'Todavía nadie calibró su rating en esta modalidad. Hacen falta diez partidas.'}
          </span>
        ) : null}

        {resto.map((fila) => (
          <Link
            key={fila.username}
            to={`/perfil/${fila.username}`}
            className="grid items-center gap-4 px-6 py-3"
            style={{
              gridTemplateColumns: '64px 1fr 110px 100px 110px',
              borderTop: '1px solid var(--bg-elevated)',
              color: 'var(--text-primary)',
              background: fila.username === user?.username ? 'var(--accent-wash)' : 'transparent',
            }}
          >
            <span className="gb-mono text-sm" style={{ color: 'var(--text-muted)' }}>
              {fila.provisional ? '—' : fila.posicion}
            </span>
            <span className="flex items-center gap-3">
              <Avatar username={fila.username} url={fila.avatarUrl} size={30} />
              <span className="text-sm">{fila.username}</span>
              {fila.country ? (
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{fila.country}</span>
              ) : null}
            </span>
            <span className="gb-mono text-right text-[15px] font-bold">{fila.rating}</span>
            <span className="gb-mono text-right text-[13px]" style={{ color: 'var(--text-muted)' }}>
              {fila.peak}
            </span>
            <span className="gb-mono text-right text-[13px]" style={{ color: 'var(--text-muted)' }}>
              {fila.gamesPlayed.toLocaleString('es-AR')}
            </span>
          </Link>
        ))}

        {/* Tu posición, fijada al pie aunque estés en el puesto 4.812 */}
        {mio.data?.fila && !busqueda ? (
          <div
            className="grid items-center gap-4 px-6 py-4"
            style={{
              gridTemplateColumns: '64px 1fr 110px 100px 110px',
              background: 'var(--accent-wash)',
              borderTop: '1px solid var(--accent)',
            }}
          >
            <span className="gb-mono text-sm" style={{ color: 'var(--accent-text)' }}>
              {mio.data.fila.provisional ? '—' : mio.data.fila.posicion}
            </span>
            <span className="flex items-center gap-3">
              <Avatar username={mio.data.fila.username} url={mio.data.fila.avatarUrl} size={30} status="online" />
              <span className="text-sm">{mio.data.fila.username}</span>
              <span className="text-[11px]" style={{ color: 'var(--accent-text)' }}>vos</span>
              {mio.data.fila.provisional ? (
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  faltan {10 - mio.data.fila.gamesPlayed} partidas para entrar
                </span>
              ) : null}
            </span>
            <span className="gb-mono text-right text-[15px] font-bold" style={{ color: 'var(--accent-text)' }}>
              {mio.data.fila.rating}
            </span>
            <span className="gb-mono text-right text-[13px]" style={{ color: 'var(--text-muted)' }}>
              {mio.data.fila.peak}
            </span>
            <span className="gb-mono text-right text-[13px]" style={{ color: 'var(--text-muted)' }}>
              {mio.data.fila.gamesPlayed.toLocaleString('es-AR')}
            </span>
          </div>
        ) : null}
      </section>

      {/* Paginación */}
      {!busqueda && (tabla.data?.paginas ?? 0) > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <Button disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
          <span className="gb-mono text-[13px]" style={{ color: 'var(--text-muted)' }}>
            {pagina + 1} / {tabla.data?.paginas}
          </span>
          <Button
            disabled={pagina + 1 >= (tabla.data?.paginas ?? 1)}
            onClick={() => setPagina((p) => p + 1)}
          >
            Siguiente
          </Button>
        </div>
      ) : null}
    </div>
  );
}
