import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Avatar } from '@gambito/ui';
import { useSession } from '../state/session.js';
import { useSocket } from '../state/socket.js';
import { useTheme } from '../state/theme.js';
import { Logo } from './Logo.js';
import { AvisoCorreo } from './AvisoCorreo.js';
import { PieDeFuente } from './PieDeFuente.js';

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useSession();
  const { connected } = useSocket();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  return (
    <>
      <AvisoCorreo />
      <header
        className="flex h-[68px] shrink-0 items-center gap-6 px-5 sm:px-10"
        style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}
      >
        <Link to="/" className="flex items-center gap-2.5" style={{ color: 'var(--text-primary)' }}>
          <Logo size={24} />
          <span className="gb-display hidden text-[19px] tracking-[0.18em] sm:inline">GAMBITO</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {[
            ['/', 'Jugar'],
            ['/torneos', 'Torneos'],
            ['/entrenamiento', 'Entrenamiento'],
            ['/ranking', 'Ranking'],
            // El enlace sólo aparece para quien puede usarlo; la ruta igual
            // está protegida del lado del servidor.
            ...(user?.role === 'MODERATOR' || user?.role === 'ADMIN'
              ? [['/moderacion', 'Moderación']]
              : []),
          ].map(([destino, etiqueta]) => (
            <NavLink
              key={destino}
              to={destino!}
              end={destino === '/'}
              className="text-sm"
              style={({ isActive }) => ({
                color: isActive ? 'var(--accent-text)' : 'var(--text-muted)',
                fontWeight: isActive ? 500 : 400,
              })}
            >
              {etiqueta}
            </NavLink>
          ))}
        </nav>

        <div className="flex-1" />

        {!connected ? (
          <span
            className="gb-mono text-[11px]"
            style={{ color: 'var(--danger)' }}
            title="Se perdió la conexión con el servidor; se reintenta sola."
          >
            SIN CONEXIÓN
          </span>
        ) : null}

        <button
          type="button"
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          className="flex h-11 w-11 items-center justify-center rounded-[10px]"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        >
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
            </svg>
          )}
        </button>

        <div className="flex items-center gap-3">
          <Link to="/perfil" className="flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
            <span className="hidden text-sm sm:inline">{user?.username}</span>
            <Avatar username={user?.username ?? null} url={user?.avatarUrl} status="online" size={40} />
          </Link>
          <button
            type="button"
            className="gb-btn gb-btn--ghost"
            onClick={async () => {
              await logout();
              navigate('/entrar', { replace: true });
            }}
          >
            Salir
          </button>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
      <PieDeFuente />
    </>
  );
}
