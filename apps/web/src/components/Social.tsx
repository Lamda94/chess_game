import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, Button } from '@gambito/ui';
import { formatTimeControl } from '@gambito/shared';
import { ApiError, api, get, post } from '../api/client.js';
import { OpcionesDesafio, useOpcionesDesafio } from './OpcionesDesafio.js';

interface Amigo {
  id: string;
  username: string | null;
  avatarUrl: string | null;
  enLinea: boolean;
}

interface Desafio {
  id: string;
  fromId: string;
  initialSec: number;
  incrementSec: number;
  rated: boolean;
  from: { username: string | null; avatarUrl: string | null };
  to: { username: string | null } | null;
}

/** Amigos y pedidos pendientes. */
export function PanelAmigos() {
  const [opciones, setOpciones] = useOpcionesDesafio();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: ['amigos'],
    queryFn: () => get<{ amigos: Amigo[]; pendientes: Amigo[]; enviados: Amigo[] }>('/friends'),
    refetchInterval: 30_000,
  });

  const refrescar = () => {
    void queryClient.invalidateQueries({ queryKey: ['amigos'] });
  };

  const agregar = useMutation({
    mutationFn: (username: string) => post(`/friends/${encodeURIComponent(username)}`),
    onSuccess: () => {
      setNombre('');
      setError(null);
      refrescar();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'No se pudo agregar.'),
  });

  const aceptar = useMutation({
    mutationFn: (username: string) => post(`/friends/${encodeURIComponent(username)}/accept`),
    onSuccess: refrescar,
  });

  const quitar = useMutation({
    mutationFn: (username: string) =>
      api(`/friends/${encodeURIComponent(username)}`, { method: 'DELETE' }),
    onSuccess: refrescar,
  });

  const desafiar = useMutation({
    mutationFn: (username: string) =>
      post<{ desafio: { id: string } }>('/challenges', { username, ...opciones }),
    onSuccess: ({ desafio }) => navigate(`/desafio/${desafio.id}`),
  });

  /** Sin destinatario: lo toma quien abra el enlace. */
  const desafioAbierto = useMutation({
    mutationFn: () => post<{ desafio: { id: string } }>('/challenges', opciones),
    onSuccess: ({ desafio }) => navigate(`/desafio/${desafio.id}`),
  });

  const datos = consulta.data;

  return (
    <section className="gb-card flex flex-col gap-3.5">
      <div className="flex items-baseline justify-between">
        <h2 className="gb-display m-0 text-[22px]">Amigos</h2>
        <span className="text-xs" style={{ color: 'var(--success)' }}>
          {datos?.amigos.filter((a) => a.enLinea).length ?? 0} en línea
        </span>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(evento) => {
          evento.preventDefault();
          if (nombre.trim()) agregar.mutate(nombre.trim());
        }}
      >
        <label htmlFor="agregar-amigo" className="sr-only">Agregar por nombre de jugador</label>
        <input
          id="agregar-amigo"
          className="gb-input"
          style={{ height: 40 }}
          placeholder="Agregar por nombre…"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <Button type="submit" disabled={agregar.isPending || nombre.trim().length < 3}>
          Agregar
        </Button>
      </form>
      {error ? (
        <span className="text-[12px]" style={{ color: 'var(--danger)' }}>{error}</span>
      ) : null}

      <div
        className="flex flex-col gap-2.5 rounded-xl p-3"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
      >
        <OpcionesDesafio opciones={opciones} onChange={setOpciones} />
        <Button block disabled={desafioAbierto.isPending} onClick={() => desafioAbierto.mutate()}>
          Crear desafío por enlace
        </Button>
      </div>

      {datos?.pendientes.length ? (
        <div className="flex flex-col gap-2">
          <span className="gb-mono text-[11px] tracking-[0.14em]" style={{ color: 'var(--cool)' }}>
            TE QUIEREN AGREGAR
          </span>
          {datos.pendientes.map((amigo) => (
            <div key={amigo.id} className="flex items-center gap-2.5">
              <Avatar username={amigo.username} url={amigo.avatarUrl} size={30} />
              <span className="flex-1 truncate text-[13px]">{amigo.username}</span>
              <Button onClick={() => aceptar.mutate(amigo.username!)}>Aceptar</Button>
              <Button variant="ghost" onClick={() => quitar.mutate(amigo.username!)}>No</Button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5">
        {datos?.amigos.length === 0 && datos.pendientes.length === 0 ? (
          <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
            Todavía no agregaste a nadie. Buscá por nombre de jugador.
          </span>
        ) : null}
        {datos?.amigos.map((amigo) => (
          <div key={amigo.id} className="flex items-center gap-2.5">
            <Avatar
              username={amigo.username}
              url={amigo.avatarUrl}
              size={32}
              status={amigo.enLinea ? 'online' : 'offline'}
            />
            <Link
              to={`/perfil/${amigo.username}`}
              className="flex-1 truncate text-[13px]"
              style={{ color: 'var(--text-primary)' }}
            >
              {amigo.username}
            </Link>
            <Button
              disabled={desafiar.isPending}
              onClick={() => desafiar.mutate(amigo.username!)}
            >
              Desafiar
            </Button>
          </div>
        ))}
      </div>

      {datos?.enviados.length ? (
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {datos.enviados.length} pedido{datos.enviados.length === 1 ? '' : 's'} esperando respuesta
        </span>
      ) : null}
    </section>
  );
}

/** Desafíos recibidos y enviados que siguen vigentes. */
export function PanelDesafios() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const consulta = useQuery({
    queryKey: ['desafios'],
    queryFn: () => get<{ recibidos: Desafio[]; enviados: Desafio[] }>('/challenges'),
    refetchInterval: 10_000,
  });

  const aceptar = useMutation({
    mutationFn: (id: string) => post<{ gameId: string }>(`/challenges/${id}/accept`),
    onSuccess: ({ gameId }) => navigate(`/partida/${gameId}`),
  });

  const rechazar = useMutation({
    mutationFn: (id: string) => post(`/challenges/${id}/decline`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['desafios'] }),
  });

  const recibidos = consulta.data?.recibidos ?? [];
  const enviados = consulta.data?.enviados ?? [];
  if (recibidos.length === 0 && enviados.length === 0) return null;

  return (
    <section
      className="flex flex-col gap-3 rounded-2xl p-5"
      style={{ background: 'var(--cool-wash)', border: '1px solid var(--cool-wash-border)' }}
    >
      <span className="gb-mono text-[11px] tracking-[0.14em]" style={{ color: 'var(--cool)' }}>
        DESAFÍOS
      </span>

      {recibidos.map((desafio) => (
        <div key={desafio.id} className="flex flex-wrap items-center gap-2.5">
          <Avatar username={desafio.from.username} url={desafio.from.avatarUrl} size={30} />
          <span className="flex-1 text-[13px]">
            <strong>{desafio.from.username}</strong> te desafía a{' '}
            <span className="gb-mono">
              {formatTimeControl({ initialSec: desafio.initialSec, incrementSec: desafio.incrementSec })}
            </span>
            {desafio.rated ? '' : ' (amistosa)'}
          </span>
          <Button variant="primary" onClick={() => aceptar.mutate(desafio.id)}>Aceptar</Button>
          <Button variant="ghost" onClick={() => rechazar.mutate(desafio.id)}>Rechazar</Button>
        </div>
      ))}

      {enviados.map((desafio) => (
        <div key={desafio.id} className="flex flex-wrap items-center gap-2.5">
          <span className="flex-1 text-[13px]" style={{ color: 'var(--text-muted)' }}>
            Esperando a {desafio.to?.username ?? 'quien abra el enlace'} ·{' '}
            <Link to={`/desafio/${desafio.id}`}>ver enlace</Link>
          </span>
          <Button variant="ghost" onClick={() => rechazar.mutate(desafio.id)}>Cancelar</Button>
        </div>
      ))}
    </section>
  );
}
