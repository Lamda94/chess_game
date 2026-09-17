# Gambito

Copyright (C) 2026 Luis Martínez

Este programa es software libre: podés redistribuirlo y/o modificarlo bajo los
términos de la Licencia Pública General Affero de GNU publicada por la Free
Software Foundation, en su versión 3.

Se distribuye con la esperanza de que sea útil, pero **SIN NINGUNA GARANTÍA**;
ni siquiera la garantía implícita de COMERCIABILIDAD o APTITUD PARA UN PROPÓSITO
DETERMINADO. Mirá la Licencia Pública General Affero de GNU para más detalles.

Junto con este programa deberías haber recibido una copia de la licencia, en el
archivo [`LICENSE`](LICENSE). Si no, mirá <https://www.gnu.org/licenses/>.

## Por qué AGPL y no GPL

Gambito es una aplicación web. La GPLv3 se activa al *distribuir* el programa, y
quien levanta un sitio no distribuye nada: sus usuarios reciben páginas, no el
programa. Con GPLv3, cualquiera podría tomar este código, modificarlo, ofrecerlo
como su propio servicio y no publicar una línea.

La AGPL cierra eso en su artículo 13: si la gente interactúa con el programa a
través de una red, hay que ofrecerles el código fuente de la versión que están
usando. Para software que corre en un servidor, la GPLv3 es la versión que no
protege.

## Stockfish

La sala de práctica y el visor de análisis usan [Stockfish](https://stockfishchess.org),
que es un proyecto aparte bajo **GPLv3**. No es parte de Gambito: se carga como
un Web Worker separado y se comunica por mensajes UCI.

Su licencia viaja junto al binario, en `/engine/LICENSE-stockfish.txt`, y la
interfaz enlaza a las dos cosas. La AGPLv3 es compatible con la GPLv3 para este
uso.
