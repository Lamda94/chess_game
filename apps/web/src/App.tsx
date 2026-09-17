import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Spinner } from '@gambito/ui';
import { useSession } from './state/session.js';
import { SocketProvider } from './state/socket.js';
import { AppShell } from './components/AppShell.js';
import { Entrar } from './pages/Entrar.js';
import { ElegirNombre } from './pages/ElegirNombre.js';
import { Lobby } from './pages/Lobby.js';
import { Buscar } from './pages/Buscar.js';
import { Partida } from './pages/Partida.js';
import { Perfil } from './pages/Perfil.js';

/**
 * La práctica y el análisis son las dos pantallas que usan Stockfish y cargan
 * bastante código propio. Se parten en trozos aparte para que nadie que sólo
 * entra a jugar pague ese peso en el arranque.
 */
const Practica = lazy(() => import('./pages/Practica.js').then((m) => ({ default: m.Practica })));
const Analisis = lazy(() => import('./pages/Analisis.js').then((m) => ({ default: m.Analisis })));

function Cargando() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Spinner label="Cargando…" />
    </div>
  );
}

/** Sin sesión se va al login; sin nombre de jugador, a elegirlo. */
function Privado({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  const location = useLocation();

  if (loading) return <Cargando />;
  if (!user) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  if (user.needsUsername) return <Navigate to="/elegir-nombre" replace />;
  return <AppShell>{children}</AppShell>;
}

export function App() {
  const { user } = useSession();

  return (
    <SocketProvider enabled={Boolean(user && !user.needsUsername)}>
      <Routes>
        <Route path="/entrar" element={<Entrar />} />
        <Route path="/elegir-nombre" element={<ElegirNombre />} />
        <Route path="/" element={<Privado><Lobby /></Privado>} />
        <Route path="/buscar" element={<Privado><Buscar /></Privado>} />
        <Route
          path="/practica"
          element={
            <Privado>
              <Suspense fallback={<Cargando />}>
                <Practica />
              </Suspense>
            </Privado>
          }
        />
        <Route path="/perfil" element={<Privado><Perfil /></Privado>} />
        <Route path="/perfil/:username" element={<Privado><Perfil /></Privado>} />
        <Route
          path="/analisis/:id"
          element={
            <Privado>
              <Suspense fallback={<Cargando />}>
                <Analisis />
              </Suspense>
            </Privado>
          }
        />
        <Route path="/partida/:id" element={<Privado><Partida /></Privado>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SocketProvider>
  );
}
