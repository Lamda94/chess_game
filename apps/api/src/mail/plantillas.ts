import { env } from '../env.js';
import type { Mensaje } from './mailer.js';

/**
 * Los correos van en texto y en HTML. El texto no es un descarte: hay clientes
 * que lo muestran y filtros que penalizan al que manda sólo HTML, y además es lo
 * que se lee en `MAIL_OUTBOX` durante el desarrollo.
 */

function envoltorio(titulo: string, cuerpo: string, boton: { texto: string; url: string }): string {
  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f6f3ec;font-family:system-ui,-apple-system,sans-serif;color:#16181c">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border:1px solid #e2dcd0;border-radius:16px;padding:32px">
        <tr><td style="font-size:19px;letter-spacing:.18em;font-weight:700;padding-bottom:24px">GAMBITO</td></tr>
        <tr><td style="font-size:24px;font-weight:600;padding-bottom:12px">${titulo}</td></tr>
        <tr><td style="font-size:15px;line-height:1.6;color:#3d444f;padding-bottom:24px">${cuerpo}</td></tr>
        <tr><td style="padding-bottom:24px">
          <a href="${boton.url}" style="display:inline-block;background:#d9a441;color:#16181c;text-decoration:none;font-weight:600;padding:13px 24px;border-radius:11px">${boton.texto}</a>
        </td></tr>
        <tr><td style="font-size:12px;color:#5f6874;line-height:1.6;border-top:1px solid #e2dcd0;padding-top:16px">
          Si el botón no funciona, copiá este enlace:<br><span style="word-break:break-all">${boton.url}</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function correoDeVerificacion(para: string, token: string): Mensaje {
  const url = `${env.WEB_ORIGIN}/verificar?token=${token}`;
  return {
    para,
    asunto: 'Confirmá tu correo en Gambito',
    texto: [
      'Bienvenido a Gambito.',
      '',
      'Para confirmar que este correo es tuyo, abrí este enlace:',
      url,
      '',
      'El enlace vale 24 horas. Si no creaste esta cuenta, ignorá el mensaje.',
    ].join('\n'),
    html: envoltorio(
      'Confirmá tu correo',
      'Falta un paso para terminar de abrir tu cuenta. El enlace vale 24 horas; si no creaste esta cuenta, ignorá el mensaje.',
      { texto: 'Confirmar mi correo', url },
    ),
  };
}

export function correoDeRecuperacion(para: string, token: string): Mensaje {
  const url = `${env.WEB_ORIGIN}/restablecer?token=${token}`;
  return {
    para,
    asunto: 'Restablecer tu contraseña de Gambito',
    texto: [
      'Pediste restablecer tu contraseña.',
      '',
      'Abrí este enlace para elegir una nueva:',
      url,
      '',
      'El enlace vale una hora y sirve una sola vez.',
      'Si no lo pediste, no hace falta que hagas nada: tu contraseña sigue siendo la misma.',
    ].join('\n'),
    html: envoltorio(
      'Restablecer tu contraseña',
      'Elegí una contraseña nueva con el botón de abajo. El enlace vale una hora y sirve una sola vez. Si no lo pediste, no hace falta que hagas nada: tu contraseña sigue siendo la misma.',
      { texto: 'Elegir contraseña nueva', url },
    ),
  };
}
