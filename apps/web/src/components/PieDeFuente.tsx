/**
 * Oferta de código fuente.
 *
 * No es un crédito ni cortesía: el artículo 13 de la AGPLv3 obliga a que quien
 * usa el programa a través de una red pueda conseguir el código de la versión
 * que está usando. Un sitio que corre este código sin este enlace incumple su
 * propia licencia, así que el enlace va en todas las pantallas.
 *
 * `VITE_REPO_URL` permite que quien despliegue una versión modificada apunte a
 * *su* repositorio, que es justamente lo que la licencia le exige hacer.
 */

const REPO = import.meta.env.VITE_REPO_URL ?? 'https://github.com/Lamda94/chess_game';

export function PieDeFuente() {
  return (
    <footer
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-5 py-4 text-[11px] sm:px-10"
      style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}
    >
      <span>
        Gambito es software libre bajo{' '}
        <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noreferrer noopener">
          AGPLv3
        </a>
        .
      </span>
      <a href={REPO} target="_blank" rel="noreferrer noopener">
        Código fuente
      </a>
      <span aria-hidden="true">·</span>
      <a href="https://stockfishchess.org" target="_blank" rel="noreferrer noopener">
        Motor Stockfish
      </a>{' '}
      <a href="/engine/LICENSE-stockfish.txt" target="_blank" rel="noreferrer noopener">
        (GPLv3)
      </a>
    </footer>
  );
}
