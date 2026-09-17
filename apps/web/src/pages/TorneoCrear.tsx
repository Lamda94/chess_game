import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Button, Field } from '@gambito/ui';
import { FORMATO_LABEL, FORMATOS, rondasNecesarias, type Formato } from '@gambito/tournament';
import { CATEGORY_LABEL, PRESET_TIME_CONTROLS, categoryFor, formatTimeControl, type TimeControl } from '@gambito/shared';
import { ApiError, post } from '../api/client.js';

const DESCRIPCION: Record<Formato, string> = {
  SWISS:
    'Todos juegan todas las rondas contra rivales de puntaje parecido. Se desempata por Buchholz y Sonneborn-Berger.',
  ARENA:
    'Cola continua durante un tiempo fijo: cuando terminás una partida, el servidor te empareja de nuevo. Tres victorias seguidas valen doble.',
  KNOCKOUT:
    'Cuadro a partida única. El que pierde queda afuera; las tablas las pasa el mejor sembrado.',
};

function enUnaHora(): string {
  const fecha = new Date(Date.now() + 60 * 60 * 1000);
  fecha.setSeconds(0, 0);
  // El input datetime-local quiere hora local sin zona.
  const local = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function TorneoCrear() {
  const navigate = useNavigate();
  const [paso, setPaso] = useState(1);
  const [formato, setFormato] = useState<Formato>('SWISS');
  const [tiempo, setTiempo] = useState<TimeControl>({ initialSec: 900, incrementSec: 10 });
  const [datos, setDatos] = useState({
    name: '',
    description: '',
    rounds: 5,
    durationMin: 60,
    startsAt: enUnaHora(),
    minRating: '',
    maxRating: '',
    maxPlayers: '',
    isPrivate: false,
    halfPointBye: true,
  });

  const crear = useMutation({
    mutationFn: () =>
      post<{ torneo: { id: string } }>('/tournaments', {
        name: datos.name.trim(),
        description: datos.description.trim() || undefined,
        format: formato,
        timeControl: tiempo,
        rounds: formato === 'SWISS' ? datos.rounds : undefined,
        durationMin: formato === 'ARENA' ? datos.durationMin : undefined,
        startsAt: new Date(datos.startsAt).toISOString(),
        minRating: datos.minRating ? Number(datos.minRating) : undefined,
        maxRating: datos.maxRating ? Number(datos.maxRating) : undefined,
        maxPlayers: datos.maxPlayers ? Number(datos.maxPlayers) : undefined,
        isPrivate: datos.isPrivate,
        halfPointBye: datos.halfPointBye,
      }),
    onSuccess: ({ torneo }) => navigate(`/torneos/${torneo.id}`),
  });

  const error = crear.error instanceof ApiError ? crear.error : null;

  const duracionEstimada = useMemo(() => {
    const porPartida = (tiempo.initialSec + 40 * tiempo.incrementSec) * 2;
    const rondas = formato === 'SWISS' ? datos.rounds : formato === 'KNOCKOUT' ? 4 : 0;
    if (formato === 'ARENA') return `${datos.durationMin} min`;
    const minutos = Math.round((porPartida * rondas) / 60);
    return minutos >= 60 ? `≈ ${Math.floor(minutos / 60)} h ${minutos % 60} min` : `≈ ${minutos} min`;
  }, [tiempo, formato, datos.rounds, datos.durationMin]);

  const nombreValido = datos.name.trim().length >= 3;

  return (
    <div className="mx-auto flex w-full max-w-[1200px] gap-6 px-5 py-8 sm:px-8">
      {/* Pasos */}
      <nav className="hidden w-[240px] shrink-0 flex-col gap-1.5 lg:flex">
        <h1 className="gb-display m-0 mb-4 text-[30px] leading-tight">Crear torneo</h1>
        {['Formato', 'Reglas y tiempo', 'Acceso y publicación'].map((etiqueta, indice) => {
          const numero = indice + 1;
          const activo = paso === numero;
          const hecho = paso > numero;
          return (
            <button
              key={etiqueta}
              type="button"
              onClick={() => setPaso(numero)}
              className="flex items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm"
              style={{
                background: activo ? 'var(--accent-wash)' : 'var(--bg-surface)',
                border: `1px solid ${activo ? 'var(--accent)' : 'var(--border)'}`,
                color: activo || hecho ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              <span
                className="gb-mono flex h-6 w-6 items-center justify-center rounded-full text-[13px]"
                style={{
                  background: hecho ? 'var(--success)' : activo ? 'var(--accent)' : 'transparent',
                  border: hecho || activo ? 'none' : '1px solid var(--border-strong)',
                  color: hecho || activo ? 'var(--accent-ink)' : 'var(--text-muted)',
                }}
              >
                {hecho ? '✓' : numero}
              </span>
              {etiqueta}
            </button>
          );
        })}
      </nav>

      {/* Formulario */}
      <section className="gb-card flex min-w-0 flex-1 flex-col gap-6">
        {paso === 1 ? (
          <>
            <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Elegí el formato</span>
            <div className="grid gap-3.5 md:grid-cols-3">
              {FORMATOS.map((valor) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setFormato(valor)}
                  className="flex flex-col gap-2 rounded-xl p-4 text-left"
                  style={{
                    border: `1px solid ${formato === valor ? 'var(--accent)' : 'var(--border)'}`,
                    background: formato === valor ? 'var(--accent-wash)' : 'var(--bg-elevated)',
                  }}
                >
                  <span className="gb-display text-[21px]">{FORMATO_LABEL[valor]}</span>
                  <span className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                    {DESCRIPCION[valor]}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : null}

        {paso === 2 ? (
          <>
            <div className="grid gap-5 md:grid-cols-2">
              <Field
                label="Nombre del torneo"
                value={datos.name}
                onChange={(e) => setDatos((d) => ({ ...d, name: e.target.value }))}
                error={error?.fieldError('name')}
                hint="Mínimo 3 caracteres"
              />
              <Field
                label="Comienza"
                type="datetime-local"
                value={datos.startsAt}
                onChange={(e) => setDatos((d) => ({ ...d, startsAt: e.target.value }))}
                error={error?.fieldError('startsAt')}
              />
            </div>

            <div className="flex flex-col gap-2.5">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Control de tiempo</span>
              <div className="flex flex-wrap gap-2.5">
                {PRESET_TIME_CONTROLS.map((tc) => {
                  const elegido = tc.initialSec === tiempo.initialSec && tc.incrementSec === tiempo.incrementSec;
                  return (
                    <button
                      key={formatTimeControl(tc)}
                      type="button"
                      onClick={() => setTiempo(tc)}
                      className="gb-mono h-11 rounded-[10px] px-4 text-sm"
                      style={
                        elegido
                          ? { background: 'var(--accent)', color: 'var(--accent-ink)', fontWeight: 700, border: 'none' }
                          : { background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }
                      }
                    >
                      {formatTimeControl(tc)}
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Se clasifica como {CATEGORY_LABEL[categoryFor(tiempo)].toLowerCase()}.
              </span>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              {formato === 'SWISS' ? (
                <Field
                  label="Rondas"
                  type="number"
                  min={3}
                  max={13}
                  value={datos.rounds}
                  onChange={(e) => setDatos((d) => ({ ...d, rounds: Number(e.target.value) }))}
                  error={error?.fieldError('rounds')}
                />
              ) : null}
              {formato === 'ARENA' ? (
                <Field
                  label="Duración (minutos)"
                  type="number"
                  min={15}
                  max={360}
                  value={datos.durationMin}
                  onChange={(e) => setDatos((d) => ({ ...d, durationMin: Number(e.target.value) }))}
                  error={error?.fieldError('durationMin')}
                />
              ) : null}
              <Field
                label="Rating mínimo"
                type="number"
                placeholder="sin límite"
                value={datos.minRating}
                onChange={(e) => setDatos((d) => ({ ...d, minRating: e.target.value }))}
                error={error?.fieldError('minRating')}
              />
              <Field
                label="Rating máximo"
                type="number"
                placeholder="sin límite"
                value={datos.maxRating}
                onChange={(e) => setDatos((d) => ({ ...d, maxRating: e.target.value }))}
              />
            </div>

            {formato === 'SWISS' ? (
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={datos.halfPointBye}
                  onChange={(e) => setDatos((d) => ({ ...d, halfPointBye: e.target.checked }))}
                  style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
                />
                Dar medio punto a quien queda sin rival en una ronda impar
              </label>
            ) : null}
          </>
        ) : null}

        {paso === 3 ? (
          <>
            <div className="grid gap-5 md:grid-cols-2">
              <Field
                label="Cupo máximo"
                type="number"
                placeholder="sin límite"
                value={datos.maxPlayers}
                onChange={(e) => setDatos((d) => ({ ...d, maxPlayers: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="desc" className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Descripción
              </label>
              <textarea
                id="desc"
                className="gb-input"
                style={{ height: 96, paddingTop: 12, resize: 'vertical' }}
                maxLength={400}
                value={datos.description}
                onChange={(e) => setDatos((d) => ({ ...d, description: e.target.value }))}
              />
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={datos.isPrivate}
                onChange={(e) => setDatos((d) => ({ ...d, isPrivate: e.target.checked }))}
                style={{ width: 18, height: 18, marginTop: 2, accentColor: 'var(--accent)' }}
              />
              <span>
                Privado
                <span className="block text-[12px]" style={{ color: 'var(--text-muted)' }}>
                  No aparece en el listado y hace falta un código para entrar.
                </span>
              </span>
            </label>
          </>
        ) : null}

        {crear.isError && !error?.fields ? (
          <p className="m-0 text-[13px]" style={{ color: 'var(--danger)' }}>
            {crear.error instanceof Error ? crear.error.message : 'No se pudo crear el torneo.'}
          </p>
        ) : null}

        <div className="flex-1" />
        <div className="flex justify-end gap-3">
          <Button disabled={paso === 1} onClick={() => setPaso((p) => p - 1)}>Volver</Button>
          {paso < 3 ? (
            <Button variant="primary" onClick={() => setPaso((p) => p + 1)}>Continuar</Button>
          ) : (
            <Button
              variant="primary"
              disabled={!nombreValido || crear.isPending}
              onClick={() => crear.mutate()}
            >
              {crear.isPending ? 'Creando…' : 'Crear torneo'}
            </Button>
          )}
        </div>
      </section>

      {/* Vista previa */}
      <aside className="hidden w-[300px] shrink-0 flex-col gap-4 xl:flex">
        <section className="gb-card flex flex-col gap-4">
          <span className="gb-mono text-[11px] tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
            VISTA PREVIA
          </span>
          <span className="gb-display text-[26px] leading-tight">
            {datos.name.trim() || 'Torneo sin nombre'}
          </span>
          {[
            ['Formato', FORMATO_LABEL[formato] + (formato === 'SWISS' ? `, ${datos.rounds} rondas` : '')],
            ['Tiempo', formatTimeControl(tiempo)],
            ['Modalidad', CATEGORY_LABEL[categoryFor(tiempo)]],
            ['Duración', duracionEstimada],
            [
              'Rating',
              datos.minRating || datos.maxRating
                ? `${datos.minRating || '—'} – ${datos.maxRating || '—'}`
                : 'sin límite',
            ],
            ['Acceso', datos.isPrivate ? 'privado, con código' : 'abierto'],
          ].map(([etiqueta, valor]) => (
            <div key={etiqueta} className="flex justify-between gap-3">
              <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{etiqueta}</span>
              <span className="text-right text-[13px]">{valor}</span>
            </div>
          ))}
        </section>

        {formato === 'SWISS' && datos.rounds < 7 ? (
          <section
            className="flex flex-col gap-2 rounded-2xl p-5"
            style={{ background: 'var(--cool-wash)', border: '1px solid var(--cool-wash-border)' }}
          >
            <span className="gb-mono text-[11px] tracking-[0.14em]" style={{ color: 'var(--cool)' }}>
              A TENER EN CUENTA
            </span>
            <span className="text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Con {datos.rounds} rondas el suizo separa bien hasta unos {2 ** datos.rounds} jugadores.
              Si esperás más, subí las rondas o el podio queda a suerte del desempate.
            </span>
          </section>
        ) : null}

        {formato === 'KNOCKOUT' ? (
          <section
            className="flex flex-col gap-2 rounded-2xl p-5"
            style={{ background: 'var(--cool-wash)', border: '1px solid var(--cool-wash-border)' }}
          >
            <span className="gb-mono text-[11px] tracking-[0.14em]" style={{ color: 'var(--cool)' }}>
              CÓMO SE ARMA EL CUADRO
            </span>
            <span className="text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Las rondas las decide la cantidad de inscriptos: {rondasNecesarias(16)} para
              dieciséis, {rondasNecesarias(32)} para treinta y dos. Los lugares que sobran son
              byes para los mejores sembrados.
            </span>
          </section>
        ) : null}
      </aside>
    </div>
  );
}
