import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  APARIENCIA_POR_DEFECTO,
  temaDelTablero,
  type ApparienceInput,
  type BoardTheme,
  type PieceSet,
  type SessionUser,
} from '@gambito/shared';
import { patch } from '../api/client.js';
import { useSession } from './session.js';

/**
 * Apariencia del tablero.
 *
 * Vive en la cuenta, no en el navegador: quien juega desde el teléfono y desde
 * la computadora espera ver sus mismas piezas. Por eso sale de la sesión y se
 * guarda en el servidor.
 *
 * Los colores del tema se aplican como variables CSS sobre `<html>`, que es de
 * donde ya los leía el tablero. Así el cambio alcanza de una vez al tablero, al
 * visor de análisis, a las lecciones y a los puzzles, sin tocar ninguno.
 */

interface ApparienceValue {
  pieceSet: PieceSet;
  boardTheme: BoardTheme;
  guardar: (cambios: ApparienceInput) => Promise<void>;
  guardando: boolean;
}

const ApparienceContext = createContext<ApparienceValue | null>(null);

export function ApparienceProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const queryClient = useQueryClient();

  const pieceSet = user?.pieceSet ?? APARIENCIA_POR_DEFECTO.pieceSet;
  const boardTheme = user?.boardTheme ?? APARIENCIA_POR_DEFECTO.boardTheme;

  useEffect(() => {
    const { colores } = temaDelTablero(boardTheme);
    const raiz = document.documentElement;
    raiz.style.setProperty('--board-light', colores.light);
    raiz.style.setProperty('--board-dark', colores.dark);
    raiz.style.setProperty('--board-highlight-light', colores.highlightLight);
    raiz.style.setProperty('--board-highlight-dark', colores.highlightDark);
    raiz.style.setProperty('--board-check', colores.check);
  }, [boardTheme]);

  const mutacion = useMutation({
    mutationFn: (cambios: ApparienceInput) => patch<{ user: SessionUser }>('/profile/appearance', cambios),
    onSuccess: ({ user: actualizado }) => {
      queryClient.setQueryData(['session'], { user: actualizado });
    },
  });

  const guardar = useCallback(
    async (cambios: ApparienceInput) => {
      await mutacion.mutateAsync(cambios);
    },
    [mutacion],
  );

  const valor = useMemo(
    () => ({ pieceSet, boardTheme, guardar, guardando: mutacion.isPending }),
    [boardTheme, guardar, mutacion.isPending, pieceSet],
  );

  return <ApparienceContext.Provider value={valor}>{children}</ApparienceContext.Provider>;
}

export function useApariencia(): ApparienceValue {
  const valor = useContext(ApparienceContext);
  if (!valor) throw new Error('useApariencia fuera de ApparienceProvider');
  return valor;
}
