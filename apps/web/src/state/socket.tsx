import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { PLAY_NAMESPACE, type ClientToServerEvents, type ServerToClientEvents } from '@gambito/shared';

export type PlaySocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface SocketValue {
  socket: PlaySocket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketValue>({ socket: null, connected: false });

/**
 * Un único socket para toda la sesión. La autenticación viaja en la cookie del
 * handshake, así que no hay token que pasar ni que guardar en el cliente.
 */
export function SocketProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [socket, setSocket] = useState<PlaySocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setSocket(null);
      setConnected(false);
      return;
    }

    const instance: PlaySocket = io(PLAY_NAMESPACE, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    instance.on('connect', () => setConnected(true));
    instance.on('disconnect', () => setConnected(false));
    setSocket(instance);

    return () => {
      instance.removeAllListeners();
      instance.disconnect();
    };
  }, [enabled]);

  const value = useMemo(() => ({ socket, connected }), [socket, connected]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketValue {
  return useContext(SocketContext);
}
