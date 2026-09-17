import type { FastifyPluginAsync } from 'fastify';
import {
  CATEGORIES,
  chooseUsernameSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  usernameSchema,
  verifyEmailSchema,
} from '@gambito/shared';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { HttpError } from '../plugins/authenticate.js';
import { hashPassword, verifyPassword } from './password.js';
import { issueSession, revokeSession, rotateSession, toSessionUser } from './session.js';
import { verifyGoogleIdToken } from './google.js';
import {
  VIGENCIA_RECUPERACION_MS,
  VIGENCIA_VERIFICACION_MS,
  consumirEnlace,
  emitirEnlace,
} from './enlaces.js';
import { mailer } from '../mail/mailer.js';
import { correoDeRecuperacion, correoDeVerificacion } from '../mail/plantillas.js';

const USER_SELECT = {
  id: true,
  username: true,
  email: true,
  emailVerified: true,
  avatarUrl: true,
  country: true,
  role: true,
  pieceSet: true,
  boardTheme: true,
} as const;

/**
 * Manda el correo de verificación sin dejar que un fallo del SMTP tumbe la
 * operación que lo disparó: registrarse tiene que funcionar aunque el correo no
 * salga. Queda en el log y la persona puede pedirlo de nuevo.
 */
async function mandarVerificacion(
  app: { log: { error: (o: unknown, m: string) => void } },
  userId: string,
  email: string,
): Promise<void> {
  try {
    const token = await emitirEnlace(userId, 'EMAIL_VERIFY', VIGENCIA_VERIFICACION_MS);
    await mailer.enviar(correoDeVerificacion(email, token));
  } catch (error) {
    app.log.error({ err: error, userId }, 'no se pudo mandar el correo de verificación');
  }
}

/** Toda cuenta arranca con las cuatro modalidades en 1500. */
function initialRatings() {
  return { create: CATEGORIES.map((category) => ({ category })) };
}

async function isUsernameTaken(username: string): Promise<boolean> {
  const found = await prisma.user.findUnique({
    where: { usernameLower: username.toLowerCase() },
    select: { id: true },
  });
  return found !== null;
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  /* ---------------------------------------------------------------- */
  /* Alta y acceso por correo                                           */
  /* ---------------------------------------------------------------- */

  app.post('/auth/register', {
    config: { rateLimit: { max: env.RATE_LIMIT_REGISTER_MAX, timeWindow: '1 hour' } },
    handler: async (request, reply) => {
      const input = registerSchema.parse(request.body);

      if (await isUsernameTaken(input.username)) {
        throw new HttpError(409, 'USERNAME_TAKEN', 'Ese nombre de jugador ya está tomado.');
      }
      const existingEmail = await prisma.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (existingEmail) {
        throw new HttpError(409, 'EMAIL_TAKEN', 'Ya hay una cuenta con ese correo.');
      }

      const user = await prisma.user.create({
        data: {
          username: input.username,
          usernameLower: input.username.toLowerCase(),
          email: input.email,
          passwordHash: await hashPassword(input.password),
          ratings: initialRatings(),
        },
        select: USER_SELECT,
      });

      await mandarVerificacion(app, user.id, user.email);
      await issueSession(reply, user);
      return reply.code(201).send({ user: toSessionUser(user) });
    },
  });

  app.post('/auth/login', {
    config: { rateLimit: { max: env.RATE_LIMIT_LOGIN_MAX, timeWindow: '15 minutes' } },
    handler: async (request, reply) => {
      const input = loginSchema.parse(request.body);
      const identifier = input.identifier.toLowerCase();

      const user = await prisma.user.findFirst({
        where: { OR: [{ email: identifier }, { usernameLower: identifier }] },
        select: { ...USER_SELECT, passwordHash: true, suspendedAt: true, suspendedFor: true },
      });

      if (user?.suspendedAt) {
        throw new HttpError(
          403,
          'ACCOUNT_SUSPENDED',
          `Tu cuenta está suspendida: ${user.suspendedFor ?? 'sin motivo registrado'}.`,
        );
      }

      // Mismo mensaje y mismo costo aproximado exista o no la cuenta: no filtramos
      // qué correos están registrados.
      const ok = user?.passwordHash
        ? await verifyPassword(user.passwordHash, input.password)
        : await verifyPassword('$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', input.password);

      if (!user || !ok) {
        throw new HttpError(401, 'BAD_CREDENTIALS', 'Usuario o contraseña incorrectos.');
      }

      const { passwordHash: _ignored, suspendedAt: _s, suspendedFor: _m, ...session } = user;
      await issueSession(reply, session);
      await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
      return { user: toSessionUser(session) };
    },
  });

  /* ---------------------------------------------------------------- */
  /* Sesión                                                            */
  /* ---------------------------------------------------------------- */

  app.post('/auth/refresh', async (request, reply) => {
    const user = await rotateSession(request, reply);
    if (!user) {
      throw new HttpError(401, 'NO_SESSION', 'La sesión expiró. Volvé a entrar.');
    }
    return { user: toSessionUser(user) };
  });

  app.post('/auth/logout', async (request, reply) => {
    await revokeSession(request, reply);
    return reply.code(204).send();
  });

  app.get('/auth/me', async (request) => {
    if (!request.auth) return { user: null };
    const user = await prisma.user.findUnique({
      where: { id: request.auth.sub },
      select: USER_SELECT,
    });
    return { user: user ? toSessionUser(user) : null };
  });

  /* ---------------------------------------------------------------- */
  /* Nombre de jugador                                                  */
  /* ---------------------------------------------------------------- */

  app.get('/auth/username-available', async (request) => {
    const parsed = usernameSchema.safeParse((request.query as { username?: string }).username ?? '');
    if (!parsed.success) {
      return { available: false, reason: parsed.error.issues[0]?.message ?? 'Nombre inválido' };
    }
    const taken = await isUsernameTaken(parsed.data);
    return { available: !taken, reason: taken ? 'Ya está tomado' : null };
  });

  app.post('/auth/username', {
    onRequest: [app.requireAuth],
    handler: async (request, reply) => {
      const { username } = chooseUsernameSchema.parse(request.body);
      const current = await prisma.user.findUniqueOrThrow({
        where: { id: request.auth!.sub },
        select: { username: true },
      });
      if (current.username) {
        throw new HttpError(409, 'USERNAME_SET', 'Tu nombre de jugador ya está elegido.');
      }
      if (await isUsernameTaken(username)) {
        throw new HttpError(409, 'USERNAME_TAKEN', 'Ese nombre de jugador ya está tomado.');
      }

      const user = await prisma.user.update({
        where: { id: request.auth!.sub },
        data: { username, usernameLower: username.toLowerCase() },
        select: USER_SELECT,
      });
      // El nombre va dentro del JWT, así que hay que emitir tokens nuevos.
      await issueSession(reply, user);
      return { user: toSessionUser(user) };
    },
  });

  /* ---------------------------------------------------------------- */
  /* Google                                                            */
  /* ---------------------------------------------------------------- */

  if (env.googleEnabled) {
    app.get('/auth/google/callback', async (request, reply) => {
      let idToken: string | undefined;
      try {
        const flow = app.oauth2Google;
        if (!flow) throw new Error('el plugin de Google no está registrado');
        const result = await flow.getAccessTokenFromAuthorizationCodeFlow(request);
        idToken = result.token.id_token as string | undefined;
      } catch (error) {
        request.log.warn({ err: error }, 'falló el intercambio de código con Google');
        return reply.redirect(`${env.WEB_ORIGIN}/entrar?error=oauth`);
      }
      if (!idToken) {
        return reply.redirect(`${env.WEB_ORIGIN}/entrar?error=oauth`);
      }

      let identity;
      try {
        identity = await verifyGoogleIdToken(idToken);
      } catch (error) {
        request.log.warn({ err: error }, 'id_token de Google inválido');
        return reply.redirect(`${env.WEB_ORIGIN}/entrar?error=oauth`);
      }

      const account = await prisma.oAuthAccount.findUnique({
        where: { provider_providerAccountId: { provider: 'GOOGLE', providerAccountId: identity.sub } },
        select: { user: { select: USER_SELECT } },
      });

      let user = account?.user ?? null;

      if (!user) {
        // Vincular con una cuenta existente sólo si Google confirma el correo;
        // si no, cualquiera podría reclamar una cuenta ajena con un correo sin verificar.
        const byEmail = identity.emailVerified
          ? await prisma.user.findUnique({ where: { email: identity.email }, select: USER_SELECT })
          : null;

        if (byEmail) {
          await prisma.oAuthAccount.create({
            data: {
              userId: byEmail.id,
              provider: 'GOOGLE',
              providerAccountId: identity.sub,
              email: identity.email,
              avatarUrl: identity.picture,
            },
          });
          user = byEmail;
        } else {
          // Alta nueva: queda sin nombre de jugador hasta que lo elija.
          user = await prisma.user.create({
            data: {
              email: identity.email,
              emailVerified: identity.emailVerified,
              avatarUrl: identity.picture,
              ratings: initialRatings(),
              oauthAccounts: {
                create: {
                  provider: 'GOOGLE',
                  providerAccountId: identity.sub,
                  email: identity.email,
                  avatarUrl: identity.picture,
                },
              },
            },
            select: USER_SELECT,
          });
        }
      }

      await issueSession(reply, user);
      await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
      const destination = user.username ? '/' : '/elegir-nombre';
      return reply.redirect(`${env.WEB_ORIGIN}${destination}`);
    });
  }

  /** El front consulta esto para decidir si muestra el botón de Google. */
  /* ---------------------------------------------------------------- */
  /* Verificación de correo                                             */
  /* ---------------------------------------------------------------- */

  app.post('/auth/verify-email/send', {
    config: { rateLimit: { max: env.RATE_LIMIT_RECOVERY_MAX, timeWindow: '1 hour' } },
    onRequest: [app.requireAuth],
    handler: async (request) => {
      const cuenta = await prisma.user.findUniqueOrThrow({
        where: { id: request.auth!.sub },
        select: { id: true, email: true, emailVerified: true },
      });
      // Reenviar a una cuenta ya verificada sería regalar tokens válidos.
      if (!cuenta.emailVerified) {
        await mandarVerificacion(app, cuenta.id, cuenta.email);
      }
      return { ok: true };
    },
  });

  app.post('/auth/verify-email', {
    config: { rateLimit: { max: env.RATE_LIMIT_LOGIN_MAX, timeWindow: '15 minutes' } },
    handler: async (request) => {
      const { token } = verifyEmailSchema.parse(request.body);
      const userId = await consumirEnlace(token, 'EMAIL_VERIFY');
      if (!userId) {
        throw new HttpError(400, 'BAD_TOKEN', 'El enlace no sirve o ya venció. Pedí uno nuevo.');
      }
      await prisma.user.update({ where: { id: userId }, data: { emailVerified: true } });
      return { ok: true };
    },
  });

  /* ---------------------------------------------------------------- */
  /* Recuperación de contraseña                                        */
  /* ---------------------------------------------------------------- */

  app.post('/auth/forgot-password', {
    config: { rateLimit: { max: env.RATE_LIMIT_RECOVERY_MAX, timeWindow: '1 hour' } },
    handler: async (request) => {
      const { email } = forgotPasswordSchema.parse(request.body);

      const cuenta = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, passwordHash: true, suspendedAt: true },
      });

      // Una cuenta sólo de Google no tiene contraseña que restablecer, y una
      // suspendida no vuelve por esta puerta. En los tres casos la respuesta es
      // la misma: si variara, este endpoint diría quién tiene cuenta acá.
      if (cuenta && cuenta.passwordHash && !cuenta.suspendedAt) {
        try {
          const token = await emitirEnlace(cuenta.id, 'PASSWORD_RESET', VIGENCIA_RECUPERACION_MS);
          await mailer.enviar(correoDeRecuperacion(cuenta.email, token));
        } catch (error) {
          app.log.error({ err: error, userId: cuenta.id }, 'no se pudo mandar la recuperación');
        }
      }

      return { ok: true };
    },
  });

  app.post('/auth/reset-password', {
    config: { rateLimit: { max: env.RATE_LIMIT_LOGIN_MAX, timeWindow: '15 minutes' } },
    handler: async (request, reply) => {
      const input = resetPasswordSchema.parse(request.body);
      const userId = await consumirEnlace(input.token, 'PASSWORD_RESET');
      if (!userId) {
        throw new HttpError(400, 'BAD_TOKEN', 'El enlace no sirve o ya venció. Pedí uno nuevo.');
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: await hashPassword(input.password),
          // Llegó hasta acá desde ese correo: queda demostrado que es suyo.
          emailVerified: true,
        },
        select: USER_SELECT,
      });

      // Cambiar la contraseña tiene que echar a quien estuviera dentro: si la
      // recuperación fue porque alguien entró, dejarle la sesión abierta no
      // arregla nada.
      await prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await issueSession(reply, user);
      return { user: toSessionUser(user) };
    },
  });

  app.get('/auth/providers', async () => ({ google: env.googleEnabled }));
};
