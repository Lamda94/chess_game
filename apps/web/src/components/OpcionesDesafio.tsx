import { useState } from 'react';
import {
  CATEGORY_LABEL,
  PRESET_TIME_CONTROLS,
  categoryFor,
  formatTimeControl,
  type TimeControl,
} from '@gambito/shared';

/**
 * Cómo se desafía: tiempo, color y si cuenta para el rating.
 *
 * El servidor ya aceptaba las tres cosas desde el principio; lo que faltaba era
 * poder elegirlas — el front mandaba 3+2 clasificatoria y punto.
 */

export interface Opciones {
  timeControl: TimeControl;
  rated: boolean;
  color: 'white' | 'black' | 'random';
}

export const OPCIONES_POR_DEFECTO: Opciones = {
  timeControl: { initialSec: 180, incrementSec: 2 },
  rated: true,
  color: 'random',
};

/** Guarda la última elección: quien juega blitz 3+2 lo juega siempre. */
const CLAVE = 'gambito:opciones-desafio';

export function useOpcionesDesafio(): [Opciones, (o: Opciones) => void] {
  const [opciones, setOpciones] = useState<Opciones>(() => {
    try {
      const guardado = localStorage.getItem(CLAVE);
      if (!guardado) return OPCIONES_POR_DEFECTO;
      const leido = JSON.parse(guardado) as Opciones;
      // Se valida contra la lista actual: un control retirado no puede quedar fijo.
      const existe = PRESET_TIME_CONTROLS.some(
        (p) =>
          p.initialSec === leido.timeControl?.initialSec &&
          p.incrementSec === leido.timeControl?.incrementSec,
      );
      return existe ? leido : OPCIONES_POR_DEFECTO;
    } catch {
      return OPCIONES_POR_DEFECTO;
    }
  });

  const guardar = (o: Opciones) => {
    setOpciones(o);
    try {
      localStorage.setItem(CLAVE, JSON.stringify(o));
    } catch {
      // Modo privado o almacenamiento lleno: la elección vale para esta sesión.
    }
  };

  return [opciones, guardar];
}

function valorDe(tc: TimeControl): string {
  return `${tc.initialSec}-${tc.incrementSec}`;
}

export function OpcionesDesafio({
  opciones,
  onChange,
}: {
  opciones: Opciones;
  onChange: (o: Opciones) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className="gb-mono text-[11px] tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
          TIEMPO
        </span>
        <select
          className="gb-input"
          style={{ height: 40 }}
          aria-label="Tiempo de la partida"
          value={valorDe(opciones.timeControl)}
          onChange={(e) => {
            const [inicial, incremento] = e.target.value.split('-').map(Number);
            onChange({
              ...opciones,
              timeControl: { initialSec: inicial!, incrementSec: incremento! },
            });
          }}
        >
          {PRESET_TIME_CONTROLS.map((tc) => (
            <option key={valorDe(tc)} value={valorDe(tc)}>
              {CATEGORY_LABEL[categoryFor(tc)]} · {formatTimeControl(tc)}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="gb-mono text-[11px] tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
            JUGÁS CON
          </span>
          <select
            className="gb-input"
            style={{ height: 40 }}
            aria-label="Color con el que jugás"
            value={opciones.color}
            onChange={(e) => onChange({ ...opciones, color: e.target.value as Opciones['color'] })}
          >
            <option value="random">Al azar</option>
            <option value="white">Blancas</option>
            <option value="black">Negras</option>
          </select>
        </label>

        <label className="flex shrink-0 items-center gap-2 pb-2.5 text-[13px]">
          <input
            type="checkbox"
            checked={opciones.rated}
            onChange={(e) => onChange({ ...opciones, rated: e.target.checked })}
            style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
          />
          Clasificatoria
        </label>
      </div>
    </div>
  );
}
