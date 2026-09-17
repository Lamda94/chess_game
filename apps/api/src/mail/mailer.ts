import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createTransport, type Transporter } from 'nodemailer';
import { env, isProd } from '../env.js';

/**
 * Envío de correo.
 *
 * Hay dos implementaciones y la elección es automática: si hay `SMTP_URL` se
 * manda de verdad, y si no se escribe a un archivo. Lo segundo no es un apaño
 * para las pruebas — es lo que hace que alguien pueda levantar el proyecto
 * y recuperar una contraseña sin montar un servidor de correo. En producción no
 * se permite: `env.ts` exige `SMTP_URL` ahí, porque una recuperación que escribe
 * en un archivo del servidor no recupera nada.
 */

export interface Mensaje {
  para: string;
  asunto: string;
  texto: string;
  html: string;
}

export interface Mailer {
  enviar(mensaje: Mensaje): Promise<void>;
}

/** Escribe cada mensaje como una línea JSON. Sirve para leerlo en desarrollo. */
class MailerDeArchivo implements Mailer {
  constructor(private readonly ruta: string) {
    mkdirSync(dirname(ruta), { recursive: true });
  }

  async enviar(mensaje: Mensaje): Promise<void> {
    const linea = JSON.stringify({ at: new Date().toISOString(), ...mensaje });
    appendFileSync(this.ruta, `${linea}\n`, 'utf8');
    // Con el enlace en la consola no hace falta ir a buscar el archivo.
    const enlace = /https?:\/\/\S+/.exec(mensaje.texto)?.[0];
    console.info(`[correo] para ${mensaje.para}: ${mensaje.asunto}${enlace ? `\n  ${enlace}` : ''}`);
  }
}

class MailerSmtp implements Mailer {
  private readonly transporte: Transporter;

  constructor(url: string, private readonly remitente: string) {
    this.transporte = createTransport(url);
  }

  async enviar(mensaje: Mensaje): Promise<void> {
    await this.transporte.sendMail({
      from: this.remitente,
      to: mensaje.para,
      subject: mensaje.asunto,
      text: mensaje.texto,
      html: mensaje.html,
    });
  }
}

function construir(): Mailer {
  if (env.SMTP_URL) return new MailerSmtp(env.SMTP_URL, env.MAIL_FROM);
  if (isProd) {
    // env.ts ya lo impide; esto es la red por si alguien toca la validación.
    throw new Error('En producción hace falta SMTP_URL para poder mandar correo.');
  }
  return new MailerDeArchivo(env.MAIL_OUTBOX);
}

export const mailer: Mailer = construir();
