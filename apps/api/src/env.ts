import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Carga apps/api/.env antes de validar. En producción las variables vienen del
// entorno real y este archivo simplemente no existe.
loadDotenv();

/**
 * La configuración se valida una sola vez al arrancar. Si falta algo el proceso
 * muere acá con un mensaje claro, en vez de fallar a las dos horas en una request.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  WEB_ORIGIN: z.string().url(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET necesita al menos 32 caracteres'),
  COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET necesita al menos 32 caracteres'),

  /** Si faltan, la app arranca igual pero sin el botón de Google. */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  /**
   * Correo. Sin `SMTP_URL` los mensajes se escriben en `MAIL_OUTBOX` en vez de
   * mandarse, lo que alcanza para desarrollo y para las pruebas. En producción
   * es obligatoria: sin ella nadie podría recuperar su contraseña.
   */
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('Gambito <no-responder@gambito.local>'),
  MAIL_OUTBOX: z.string().default('.mail/outbox.jsonl'),

  /**
   * Límites por IP. Los valores por defecto son los de producción; en desarrollo
   * y en las pruebas de punta a punta se suben a propósito desde el .env, porque
   * ahí se crean decenas de cuentas por hora. Se configuran, no se desactivan.
   */
  RATE_LIMIT_GLOBAL_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_REGISTER_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(20),
  /** Pedidos de recuperación: bajo a propósito, es el que más se abusa. */
  RATE_LIMIT_RECOVERY_MAX: z.coerce.number().int().positive().default(5),
});

export type Env = z.infer<typeof schema> & { googleEnabled: boolean };

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  · ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración inválida:\n${detail}`);
  }
  const value = parsed.data;
  const googleEnabled = Boolean(value.GOOGLE_CLIENT_ID && value.GOOGLE_CLIENT_SECRET);
  if (value.NODE_ENV === 'production') {
    if (value.JWT_SECRET.startsWith('cambiar-esto')) {
      throw new Error('JWT_SECRET sigue siendo el de ejemplo; generá uno real antes de producción.');
    }
    if (value.COOKIE_SECRET.startsWith('cambiar-esto')) {
      throw new Error('COOKIE_SECRET sigue siendo el de ejemplo.');
    }
    if (!value.SMTP_URL) {
      throw new Error(
        'Falta SMTP_URL. Sin correo saliente nadie puede verificar su cuenta ni recuperar su contraseña.',
      );
    }
  }
  return { ...value, googleEnabled };
}

export const env: Env = load();
export const isProd = env.NODE_ENV === 'production';
