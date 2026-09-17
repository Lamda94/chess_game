/**
 * Aviso de licencia del motor.
 *
 * Stockfish es GPLv3 y el navegador de cada visitante recibe una copia, así que
 * la licencia obliga a acompañarla con su texto y con una forma de llegar a la
 * fuente. Este aviso aparece en las dos pantallas que lo cargan.
 */
export function AvisoMotor() {
  return (
    <p className="m-0 text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
      Análisis por{' '}
      <a href="https://github.com/official-stockfish/Stockfish" target="_blank" rel="noreferrer noopener">
        Stockfish 19
      </a>
      , compilado a WebAssembly por{' '}
      <a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noreferrer noopener">
        stockfish.js
      </a>
      . Software libre bajo{' '}
      <a href="/engine/LICENSE-stockfish.txt" target="_blank" rel="noreferrer noopener">
        GPLv3
      </a>
      .
    </p>
  );
}
