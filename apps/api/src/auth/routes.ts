import type { FastifyPluginAsync } from 'fastify';
import {
  CATEGORIES,
  chooseUsernameSchema,
  loginSchema,
  registerSchema,
  usernameSchema,
} from '@gambito/shared';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { HttpError } from '../plugins/authenticate.js';
import { hashPassword, verifyPassword } from './password.js';
import { issueSession, revokeSession, rotateSession, toSessionUser } from './session.js';
import { verifyGoogleIdToken } from './google.js';

const USER_SELECT = {
  id: true,
  username: true,
  email: true,
  avatarUrl: true,
  country: true,
  role: true,
} as const;

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
  app.get('/auth/providers', async () => ({ google: env.googleEnabled }));
};
