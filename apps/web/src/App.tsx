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
import { Ranking } from './pages/Ranking.js';
import { Entrenamiento } from './pages/Entrenamiento.js';
import { Puzzles } from './pages/Puzzles.js';
import { Torneos } from './pages/Torneos.js';
import { TorneoCrear } from './pages/TorneoCrear.js';
import { TorneoSala } from './pages/TorneoSala.js';
import { Desafio } from './pages/Desafio.js';
import { Moderacion } from './pages/Moderacion.js';
import { Olvide } from './pages/Olvide.js';
import { Restablecer } from './pages/Restablecer.js';
import { Verificar } from './pages/Verificar.js';

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
        <Route path="/olvide" element={<Olvide />} />
        <Route path="/restablecer" element={<Restablecer />} />
        <Route path="/verificar" element={<Verificar />} />
        <Route path="/elegir-nombre" element={<ElegirNombre />} />
        <Route path="/" element={<Privado><Lobby /></Privado>} />
        <Route path="/buscar" element={<Privado><Buscar /></Privado>} />
        <Route path="/moderacion" element={<Privado><Moderacion /></Privado>} />
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
        <Route path="/ranking" element={<Privado><Ranking /></Privado>} />
        <Route path="/entrenamiento" element={<Privado><Entrenamiento /></Privado>} />
        <Route path="/entrenamiento/:slug" element={<Privado><Entrenamiento /></Privado>} />
        <Route path="/puzzles" element={<Privado><Puzzles /></Privado>} />
        <Route path="/torneos" element={<Privado><Torneos /></Privado>} />
        <Route path="/torneos/crear" element={<Privado><TorneoCrear /></Privado>} />
        <Route path="/torneos/:id" element={<Privado><TorneoSala /></Privado>} />
        <Route path="/desafio/:id" element={<Privado><Desafio /></Privado>} />
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
