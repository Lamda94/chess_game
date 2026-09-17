import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@gambito/ui';
import { CATEGORY_LABEL, categoryFor, formatTimeControl, type QueueStatusPayload } from '@gambito/shared';
import { useSocket } from '../state/socket.js';
import { Logo } from '../components/Logo.js';

export function Buscar() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { socket, connected } = useSocket();
  const [status, setStatus] = useState<QueueStatusPayload | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const timeControl = {
    initialSec: Number(params.get('t') ?? 180),
    incrementSec: Number(params.get('i') ?? 2),
  };
  const category = categoryFor(timeControl);

  useEffect(() => {
    if (!socket || !connected) return;

    socket.emit('queue:join', { timeControl, rated: true });
    socket.on('queue:status', setStatus);
    socket.on('queue:matched', ({ gameId }) => navigate(`/partida/${gameId}`, { replace: true }));

    return () => {
      socket.off('queue:status', setStatus);
      socket.off('queue:matched');
      // Salir de la pantalla saca de la cola: nadie queda emparejable por error.
      socket.emit('queue:leave');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, connected, timeControl.initialSec, timeControl.incrementSec]);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const seconds = String(elapsed % 60).padStart(2, '0');
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 px-5 py-10">
      <div className="gb-card flex w-full max-w-[620px] flex-col items-center gap-6" style={{ padding: 44 }}>
        <div
          className="relative flex h-[148px] w-[148px] items-center justify-center rounded-full"
          style={{ border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}
        >
          <span
            className="absolute inset-[-1px] rounded-full"
            style={{
              border: '2px solid transparent',
              borderTopColor: 'var(--accent)',
              borderRightColor: 'var(--accent)',
              animation: 'gb-spin 1100ms linear infinite',
            }}
          />
          <Logo size={62} />
        </div>

        <div className="flex flex-col items-center gap-2">
          <h1 className="gb-display m-0 text-[38px]">Buscando rival</h1>
          <span className="text-[15px]" style={{ color: 'var(--text-muted)' }}>
            {CATEGORY_LABEL[category]} {formatTimeControl(timeControl)} · clasificatoria
          </span>
        </div>

        <div className="flex w-full flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Rango de rating</span>
            <span className="gb-mono text-sm">
              {status ? `${status.ratingRange.min} – ${status.ratingRange.max}` : '—'}
            </span>
          </div>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            El rango se abre 50 puntos cada 5 segundos hasta ±400.
          </span>
        </div>

        <span className="h-px w-full" style={{ background: 'var(--border)' }} />

        <div className="flex w-full items-center justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Tiempo en cola</span>
            <span className="gb-mono text-[26px] font-bold">{minutes}:{seconds}</span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>En cola en tu rango</span>
            <span className="gb-mono text-[26px] font-bold" style={{ color: 'var(--cool)' }}>
              {status?.queued ?? '—'}
            </span>
          </div>
        </div>

        <Button variant="secondary" block onClick={() => navigate('/')} style={{ height: 50 }}>
          Cancelar búsqueda
        </Button>
      </div>
    </div>
  );
}
