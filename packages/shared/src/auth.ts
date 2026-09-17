import { z } from 'zod';

/**
 * El nombre de jugador es lo único público de una cuenta: aparece en el ranking,
 * en las partidas y en los torneos. Por eso es estricto y se reserva en minúsculas.
 */
export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Mínimo 3 caracteres')
  .max(20, 'Máximo 20 caracteres')
  .regex(/^[a-zA-Z0-9_]+$/, 'Sólo letras, números y guión bajo')
  .refine((v) => !/^_|_$/.test(v), 'No puede empezar ni terminar con guión bajo');

export const emailSchema = z.string().trim().toLowerCase().email('Correo inválido').max(254);

export const passwordSchema = z
  .string()
  .min(10, 'Mínimo 10 caracteres')
  .max(200, 'Máximo 200 caracteres');

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'Hay que aceptar las normas de juego limpio' }),
  }),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  /** Acepta correo o nombre de jugador. */
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(1, 'Ingresá tu contraseña'),
});
export type LoginInput = z.infer<typeof loginSchema>;

/* ------------------------------------------------------------------ */
/* Verificación de correo y recuperación de contraseña                  */
/* ------------------------------------------------------------------ */

/** El token viaja en la URL del correo: opaco, largo y en base64url. */
export const authTokenSchema = z
  .string()
  .trim()
  .min(20, 'Enlace inválido')
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/, 'Enlace inválido');

export const verifyEmailSchema = z.object({ token: authTokenSchema });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: authTokenSchema,
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Paso posterior al OAuth: el proveedor no nos da un nombre de jugador. */
export const chooseUsernameSchema = z.object({ username: usernameSchema });
export type ChooseUsernameInput = z.infer<typeof chooseUsernameSchema>;

export const ROLES = ['PLAYER', 'MODERATOR', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export interface SessionUser {
  id: string;
  username: string | null;
  email: string;
  avatarUrl: string | null;
  country: string | null;
  role: Role;
  /** Falso hasta que se abre el enlace del correo de alta. */
  emailVerified: boolean;
  /** true mientras el alta por OAuth no eligió nombre de jugador. */
  needsUsername: boolean;
}

/** Contenido del JWT de acceso. */
export interface AccessTokenClaims {
  sub: string;
  username: string | null;
  role: Role;
}
