import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Avatar, RatingBadge, Spinner } from '@gambito/ui';
import { CATEGORIES, CATEGORY_LABEL, TERMINATION_LABEL, type Category, type Termination } from '@gambito/shared';
import { get } from '../api/client.js';
import { useSession } from '../state/session.js';

interface Perfil {
  user: {
    username: string;
    avatarUrl: string | null;
    bio: string | null;
    country: string | null;
    createdAt: string;
    lastSeenAt: string;
  };
  category: Category;
  ratings: Array<{
    category: Category;
    rating: number;
    rd: number;
    peak: number;
    gamesPlayed: number;
    provisional: boolean;
  }>;
  balance: { total: number; ganadas: number; perdidas: number; tablas: number };
  porColor: Record<'white' | 'black', { total: number; ganadas: number; perdidas: number; tablas: number }>;
  curva: Array<{ date: string; rating: number }>;
  aperturas: Array<{ nombre: string; eco: string; jugadas: number; ganadas: number }>;
  actividad: Array<{ date: string; count: number }>;
  recientes: Array<{
    id: string;
    category: Category;
    rated: boolean;
    termination: Termination | null;
    startedAt: string;
    color: 'white' | 'black';
    rival: string | null;
    resultado: 'win' | 'loss' | 'draw';
  }>;
}

export function Perfil() {
  const { username: parametro } = useParams();
  const { user } = useSession();
  const username = parametro ?? user?.username ?? '';
  const [categoria, setCategoria] = useState<Category>('BLITZ');

  const consulta = useQuery({
    queryKey: ['perfil', username, categoria],
    queryFn: () => get<Perfil>(`/users/${encodeURIComponent(username)}/profile?category=${categoria}`),
    enabled: username.length > 0,
  });

  if (consulta.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner label="Cargando el perfil…" />
      </div>
    );
  }
  if (consulta.isError || !consulta.data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span style={{ color: 'var(--text-muted)' }}>No se encontró ese jugador.</span>
      </div>
    );
  }

  const perfil = consulta.data;
  const activo = perfil.ratings.find((r) => r.category === categoria)!;
  const porcentaje = perfil.balance.total
    ? ((perfil.balance.ganadas / perfil.balance.total) * 100).toFixed(1)
    : '—';

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-5 py-8 sm:px-8">
      {/* Cabecera */}
      <section className="gb-card flex flex-wrap items-center gap-6">
        <Avatar username={perfil.user.username} url={perfil.user.avatarUrl} size={88} status="online" />
        <div className="flex flex-1 flex-col gap-1.5">
          <h1 className="gb-display m-0 text-[36px] leading-none">{perfil.user.username}</h1>
          <div className="flex flex-wrap items-center gap-3 text-[13px]" style={{ color: 'var(--text-muted)' }}>
            {perfil.user.country ? <span>{perfil.user.country}</span> : null}
            <span>
              Miembro desde{' '}
              {new Date(perfil.user.createdAt).toLocaleDateString('es-AR', {
                month: 'long',
                year: 'numeric',
              })}
            </span>
            <span>{perfil.balance.total} partidas en {CATEGORY_LABEL[categoria].toLowerCase()}</span>
          </div>
          {perfil.user.bio ? <p className="m-0 mt-1 max-w-[60ch] text-sm">{perfil.user.bio}</p> : null}
        </div>
      </section>

      {/* Ratings */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {perfil.ratings.map((r) => (
          <button
            key={r.category}
            type="button"
            onClick={() => setCategoria(r.category)}
            className="gb-card flex flex-col items-start gap-1 text-left"
            style={{
              borderColor: r.category === categoria ? 'var(--accent)' : 'var(--border)',
              background: r.category === categoria ? 'var(--accent-wash)' : 'var(--bg-surface)',
            }}
          >
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {CATEGORY_LABEL[r.category]}
            </span>
            <span
              className="gb-mono text-[28px] font-bold leading-none"
              style={{ color: r.category === categoria ? 'var(--accent)' : 'var(--text-primary)' }}
            >
              {r.gamesPlayed === 0 ? '—' : r.rating}
              {r.provisional && r.gamesPlayed > 0 ? (
                <span style={{ opacity: 0.6, fontSize: 18 }}>?</span>
              ) : null}
            </span>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {r.gamesPlayed === 0
                ? 'sin partidas'
                : `${r.gamesPlayed} partidas · pico ${r.peak}`}
            </span>
          </button>
        ))}
      </div>

      {/* Curva de rating */}
      <section className="gb-card flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="gb-display m-0 text-[22px]">
            Evolución del rating de {CATEGORY_LABEL[categoria].toLowerCase()}
          </h2>
          <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
            {perfil.curva.length} partidas clasificatorias
          </span>
        </div>
        <CurvaRating puntos={perfil.curva} />
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        {/* Aperturas */}
        <section className="gb-card flex flex-col gap-4">
          <h2 className="gb-display m-0 text-[22px]">Aperturas más jugadas</h2>
          {perfil.aperturas.length === 0 ? (
            <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              Hacen falta partidas terminadas para deducir las aperturas.
            </span>
          ) : (
            <div className="flex flex-col gap-3.5">
              {perfil.aperturas.map((apertura) => {
                const maximo = perfil.aperturas[0]!.jugadas;
                const victorias = Math.round((apertura.ganadas / apertura.jugadas) * 100);
                return (
                  <div key={apertura.nombre} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm">{apertura.nombre}</span>
                      <span className="gb-mono shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {apertura.eco} · {apertura.jugadas} · {victorias}%
                      </span>
                    </div>
                    <div className="h-3 rounded" style={{ background: 'var(--bg-elevated)' }}>
                      <span
                        className="block h-full rounded"
                        style={{
                          width: `${Math.round((apertura.jugadas / maximo) * 100)}%`,
                          background: 'var(--chart-amber)',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Resultados por color */}
        <section className="gb-card flex flex-col gap-4">
          <h2 className="gb-display m-0 text-[22px]">Resultados por color</h2>
          {(['white', 'black'] as const).map((lado) => {
            const datos = perfil.porColor[lado];
            const pct = (n: number) => (datos.total ? (n / datos.total) * 100 : 0);
            return (
              <div key={lado} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px]">Con {lado === 'white' ? 'blancas' : 'negras'}</span>
                  <span className="gb-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                    {datos.total} partidas
                  </span>
                </div>
                <div className="flex h-[18px] gap-0.5">
                  <span style={{ width: `${pct(datos.ganadas)}%`, background: 'var(--success)', borderRadius: '3px 0 0 3px' }} />
                  <span style={{ width: `${pct(datos.tablas)}%`, background: 'var(--text-muted)' }} />
                  <span style={{ width: `${pct(datos.perdidas)}%`, background: 'var(--danger)', borderRadius: '0 3px 3px 0' }} />
                </div>
                <div className="flex gap-4 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  <span>{datos.ganadas} ganadas</span>
                  <span>{datos.tablas} tablas</span>
                  <span>{datos.perdidas} perdidas</span>
                </div>
              </div>
            );
          })}
          <span className="h-px" style={{ background: 'var(--border)' }} />
          <div className="flex justify-between">
            <Cifra valor={`${porcentaje}${porcentaje === '—' ? '' : ' %'}`} etiqueta="victorias" />
            <Cifra valor={String(activo.gamesPlayed)} etiqueta="partidas" />
            <Cifra valor={activo.gamesPlayed ? String(activo.peak) : '—'} etiqueta="pico" />
          </div>
        </section>
      </div>

      {/* Actividad */}
      <section className="gb-card flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="gb-display m-0 text-[22px]">Actividad</h2>
          <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>últimas 18 semanas</span>
        </div>
        <MapaActividad dias={perfil.actividad} />
      </section>

      {/* Historial */}
      <section className="gb-card flex flex-col gap-3">
        <h2 className="gb-display m-0 text-[22px]">Últimas partidas</h2>
        {perfil.recientes.length === 0 ? (
          <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
            Todavía no jugó ninguna partida.
          </span>
        ) : (
          perfil.recientes.map((partida) => (
            <Link
              key={partida.id}
              to={`/analisis/${partida.id}`}
              className="flex flex-wrap items-center gap-3 rounded-xl px-3.5 py-3"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            >
              <span
                className="gb-mono flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                style={{
                  background:
                    partida.resultado === 'win'
                      ? 'var(--success)'
                      : partida.resultado === 'loss'
                        ? 'var(--danger)'
                        : 'var(--bg-surface)',
                  color: partida.resultado === 'draw' ? 'var(--text-muted)' : 'var(--accent-ink)',
                }}
              >
                {partida.resultado === 'win' ? 'G' : partida.resultado === 'loss' ? 'P' : 'T'}
              </span>
              <span className="flex-1 text-sm">
                vs {partida.rival ?? 'anónimo'}{' '}
                <span style={{ color: 'var(--text-muted)' }}>
                  · con {partida.color === 'white' ? 'blancas' : 'negras'}
                </span>
              </span>
              <span className="gb-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                {CATEGORY_LABEL[partida.category]}
                {partida.rated ? '' : ' · amistosa'}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {partida.termination ? TERMINATION_LABEL[partida.termination] : ''}
              </span>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}

function Cifra({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="gb-display text-[26px] leading-none">{valor}</span>
      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{etiqueta}</span>
    </div>
  );
}

/**
 * Curva de rating dibujada a mano en SVG. Es una sola serie sobre una sola escala,
 * así que una librería de gráficos costaría más en peso de descarga que lo que
 * aporta: el presupuesto de la app es 200 KB comprimidos y Recharts se lleva la mitad.
 */
function CurvaRating({ puntos }: { puntos: Array<{ date: string; rating: number }> }) {
  const ancho = 1100;
  const alto = 200;
  const margenSuperior = 10;
  const margenInferior = 24;

  const grafico = useMemo(() => {
    if (puntos.length < 2) return null;

    const valores = puntos.map((p) => p.rating);
    const minimo = Math.min(...valores);
    const maximo = Math.max(...valores);
    // Un margen del diez por ciento evita que la línea toque los bordes.
    const holgura = Math.max(20, (maximo - minimo) * 0.1);
    const piso = Math.floor((minimo - holgura) / 10) * 10;
    const techo = Math.ceil((maximo + holgura) / 10) * 10;

    const x = (i: number) => (i / (puntos.length - 1)) * ancho;
    const y = (valor: number) =>
      margenSuperior + (1 - (valor - piso) / (techo - piso)) * (alto - margenSuperior - margenInferior);

    const linea = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.rating).toFixed(1)}`).join(' ');
    const area = `${linea} L${ancho} ${alto - margenInferior} L0 ${alto - margenInferior} Z`;

    return {
      linea,
      area,
      piso,
      techo,
      ultimoX: x(puntos.length - 1),
      ultimoY: y(puntos[puntos.length - 1]!.rating),
      ultimo: puntos[puntos.length - 1]!.rating,
      primero: puntos[0]!,
      ultimoPunto: puntos[puntos.length - 1]!,
    };
  }, [puntos]);

  if (!grafico) {
    return (
      <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
        Hacen falta al menos dos partidas clasificatorias para dibujar la curva.
      </span>
    );
  }

  const fecha = (iso: string) =>
    new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });

  return (
    <div className="flex gap-3">
      <div className="flex w-11 shrink-0 flex-col justify-between pb-6 text-right">
        <span className="gb-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>{grafico.techo}</span>
        <span className="gb-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>{grafico.piso}</span>
      </div>
      <div className="min-w-0 flex-1">
        <svg
          viewBox={`0 0 ${ancho} ${alto}`}
          width="100%"
          height={alto}
          role="img"
          aria-label={`Rating de ${grafico.primero.rating} el ${fecha(grafico.primero.date)} a ${grafico.ultimo} el ${fecha(grafico.ultimoPunto.date)}.`}
          preserveAspectRatio="none"
        >
          <line x1="0" y1={margenSuperior} x2={ancho} y2={margenSuperior} stroke="var(--border)" strokeWidth="1" />
          <line
            x1="0"
            y1={(alto - margenInferior + margenSuperior) / 2}
            x2={ancho}
            y2={(alto - margenInferior + margenSuperior) / 2}
            stroke="var(--border)"
            strokeWidth="1"
            strokeDasharray="3 5"
          />
          <line x1="0" y1={alto - margenInferior} x2={ancho} y2={alto - margenInferior} stroke="var(--border)" strokeWidth="1" />
          <path d={grafico.area} fill="var(--accent)" fillOpacity="0.12" />
          <path
            d={grafico.linea}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={grafico.ultimoX} cy={grafico.ultimoY} r="4" fill="var(--accent)" />
        </svg>
        <div className="flex justify-between">
          <span className="gb-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {fecha(grafico.primero.date)}
          </span>
          <span className="gb-mono text-[11px]" style={{ color: 'var(--text-primary)' }}>
            {grafico.ultimo}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Rampa secuencial de un solo tono: más partidas, más saturado. */
const PASOS = ['var(--bg-elevated)', '#4a3a16', '#7a6024', '#ac8630', 'var(--accent)'];

function MapaActividad({ dias }: { dias: Array<{ date: string; count: number }> }) {
  const porDia = new Map(dias.map((d) => [d.date, d.count]));
  const maximo = Math.max(1, ...dias.map((d) => d.count));

  // 18 columnas de 7 días, terminando hoy.
  const celdas: Array<{ date: string; count: number }> = [];
  const hoy = new Date();
  for (let i = 125; i >= 0; i--) {
    const fecha = new Date(hoy);
    fecha.setDate(hoy.getDate() - i);
    const iso = fecha.toISOString().slice(0, 10);
    celdas.push({ date: iso, count: porDia.get(iso) ?? 0 });
  }

  const paso = (count: number) => {
    if (count === 0) return PASOS[0]!;
    return PASOS[Math.min(4, Math.ceil((count / maximo) * 4))]!;
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: 'repeat(18, minmax(0, 1fr))', gridAutoRows: '1fr' }}
      >
        {celdas.map((celda) => (
          <span
            key={celda.date}
            className="block aspect-square rounded-[3px]"
            style={{ background: paso(celda.count) }}
            title={`${celda.date}: ${celda.count} ${celda.count === 1 ? 'partida' : 'partidas'}`}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>menos</span>
        {PASOS.map((color) => (
          <span key={color} className="block h-3 w-3 rounded-[3px]" style={{ background: color }} />
        ))}
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>más</span>
      </div>
    </div>
  );
}

export const CATEGORIAS = CATEGORIES;
