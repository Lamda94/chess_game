import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react';
import { cx } from './cx.js';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
}

export function Button({ variant = 'secondary', block, className, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={cx('gb-btn', `gb-btn--${variant}`, block && 'gb-btn--block', className)}
      {...rest}
    />
  );
}

export interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: Variant;
  block?: boolean;
}

/** Mismo aspecto que el botón, pero es un enlace de verdad (navegable, abrible en pestaña). */
export function LinkButton({ variant = 'secondary', block, className, ...rest }: LinkButtonProps) {
  return (
    <a
      className={cx('gb-btn', `gb-btn--${variant}`, block && 'gb-btn--block', className)}
      {...rest}
    />
  );
}

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Mensaje de error; si está presente, el campo queda marcado como inválido. */
  error?: string | null;
  hint?: ReactNode;
  valid?: boolean;
}

export function Field({ label, error, hint, valid, id, className, ...rest }: FieldProps) {
  const inputId = id ?? `f-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const hintId = `${inputId}-hint`;
  const message = error ?? hint;
  return (
    <div className="gb-field">
      <label className="gb-field__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className={cx('gb-input', className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? hintId : undefined}
        data-valid={valid && !error ? 'true' : undefined}
        {...rest}
      />
      {message ? (
        <span
          id={hintId}
          className={cx(
            'gb-field__hint',
            error && 'gb-field__hint--error',
            !error && valid && 'gb-field__hint--ok',
          )}
        >
          {message}
        </span>
      ) : null}
    </div>
  );
}

export function Card({
  accent,
  className,
  children,
  ...rest
}: { accent?: boolean } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('gb-card', accent && 'gb-card--accent', className)} {...rest}>
      {children}
    </div>
  );
}

export function RatingBadge({ rating, provisional }: { rating: number; provisional?: boolean }) {
  return (
    <span
      className={cx('gb-rating', provisional && 'gb-rating--provisional')}
      title={provisional ? 'Rating provisorio: faltan partidas para calibrarlo' : undefined}
    >
      {rating}
    </span>
  );
}

export interface AvatarProps {
  username: string | null;
  url?: string | null;
  size?: number;
  status?: 'online' | 'playing' | 'offline';
}

export function Avatar({ username, url, size = 40, status = 'offline' }: AvatarProps) {
  const initial = (username ?? '?').charAt(0).toUpperCase();
  return (
    <span
      className={cx('gb-avatar', status === 'online' && 'gb-avatar--online', status === 'playing' && 'gb-avatar--playing')}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {url ? <img src={url} alt="" /> : initial}
    </span>
  );
}

/** Formatea milisegundos como mm:ss, o m:ss.d bajo diez segundos. */
export function formatClock(ms: number): string {
  const safe = Math.max(0, ms);
  const totalSeconds = safe / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  if (safe < 10_000) return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(Math.floor(seconds)).padStart(2, '0')}`;
}

export function Clock({
  label,
  ms,
  active,
}: {
  label: string;
  ms: number;
  active?: boolean;
}) {
  const low = ms < 10_000;
  return (
    <div className={cx('gb-clock', active && 'gb-clock--active', low && 'gb-clock--low')}>
      <span className="gb-clock__label" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span className="gb-clock__time" role="timer" aria-live="off">
        {formatClock(ms)}
      </span>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span className="gb-spinner" />
      {label ? <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</span> : null}
    </span>
  );
}
