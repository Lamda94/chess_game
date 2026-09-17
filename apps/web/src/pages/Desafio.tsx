import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Avatar, Button, Spinner } from '@gambito/ui';
import { CATEGORY_LABEL, categoryFor, formatTimeControl } from '@gambito/shared';
import { ApiError, get, post } from '../api/client.js';
import { useSession } from '../state/session.js';

interface Desafio {
  id: string;
  fromId: string;
  toId: string | null;
  initialSec: number;
  incrementSec: number;
  rated: boolean;
  color: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';
  gameId: string | null;
  expiresAt: string;
  from: { username: string | null; avatarUrl: string | null };
}

export function Desafio() {
  const { id = '' } = useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: ['desafio', id],
    queryFn: () => get<{ desafio: Desafio }>(`/challenges/${id}`),
    enabled: id.length > 0,
    refetchInterval: 5_000,
  });

  const aceptar = useMutation({
    mutationFn: () => post<{ gameId: string }>(`/challenges/${id}/accept`),
    onSuccess: ({ gameId }) => navigate(`/partida/${gameId}`, { replace: true }),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'No se pudo aceptar.'),
  });

  if (consulta.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner label="Buscando el desafío…" />
      </div>
    );
  }
  if (!consulta.data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span style={{ color: 'var(--text-muted)' }}>Ese desafío no existe.</span>
      </div>
    );
  }

  const desafio = consulta.data.desafio;
  const timeControl = { initialSec: desafio.initialSec, incrementSec: desafio.incrementSec };
  const esMio = desafio.fromId === user?.id;
  const enlace = `${window.location.origin}/desafio/${desafio.id}`;

  // Si ya se aceptó, lo único útil es llevar a la partida.
  if (desafio.status === 'ACCEPTED' && desafio.gameId) {
    return (
      <div className="flex flex-1 items-center justify-center px-5">
        <div className="gb-card flex w-full max-w-[460px] flex-col items-center gap-5" style={{ padding: 36 }}>
          <h1 className="gb-display m-0 text-[30px]">El desafío ya se aceptó</h1>
          <Link to={`/partida/${desafio.gameId}`} className="gb-btn gb-btn--primary gb-btn--block">
            Ir a la partida
          </Link>
        </div>
      </div>
    );
  }

  const vencido =
    desafio.status !== 'PENDING' || new Date(desafio.expiresAt).getTime() < Date.now();

  return (
    <div className="flex flex-1 items-center justify-center px-5 py-10">
      <div className="gb-card flex w-full max-w-[520px] flex-col items-center gap-6" style={{ padding: 40 }}>
        <Avatar username={desafio.from.username} url={desafio.from.avatarUrl} size={72} />
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="gb-display m-0 text-[32px] leading-tight">
            {esMio ? 'Tu desafío está listo' : `${desafio.from.username} te desafía`}
          </h1>
          <span className="text-[15px]" style={{ color: 'var(--text-muted)' }}>
            {CATEGORY_LABEL[categoryFor(timeControl)]} {formatTimeControl(timeControl)} ·{' '}
            {desafio.rated ? 'clasificatoria' : 'amistosa'}
            {desafio.color ? ` · pide ${desafio.color === 'white' ? 'blancas' : 'negras'}` : ''}
          </span>
        </div>

        {vencido ? (
          <span className="text-[13px]" style={{ color: 'var(--danger)' }}>
            Este desafío ya no está disponible.
          </span>
        ) : esMio ? (
          <div className="flex w-full flex-col gap-3">
            <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              Pasale este enlace a quien quieras que juegue. Vence en 30 minutos.
            </span>
            <div className="flex gap-2">
              <input className="gb-input" style={{ height: 44 }} readOnly value={enlace} aria-label="Enlace del desafío" />
              <Button onClick={() => void navigator.clipboard?.writeText(enlace)}>Copiar</Button>
            </div>
            <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              La partida arranca sola apenas alguien lo acepte.
            </span>
          </div>
        ) : (
          <Button
            variant="primary"
            block
            style={{ height: 52 }}
            disabled={aceptar.isPending}
            onClick={() => aceptar.mutate()}
          >
            {aceptar.isPending ? 'Empezando…' : 'Aceptar y jugar'}
          </Button>
        )}

        {error ? (
          <span className="text-[13px]" style={{ color: 'var(--danger)' }}>{error}</span>
        ) : null}

        <Link to="/" className="text-[13px]">Volver al lobby</Link>
      </div>
    </div>
  );
}
