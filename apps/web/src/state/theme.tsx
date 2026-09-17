import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type Theme = 'dark' | 'light';
const KEY = 'gambito:tema';

function read(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {
    // Modo privado o cookies bloqueadas: se cae al tema del sistema.
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

interface ThemeValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/**
 * El tema se aplica en la raíz, no dentro del shell: si no, la pantalla de entrada
 * —que está fuera del shell— se mostraría siempre oscura aunque el sistema pida claro.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (typeof window === 'undefined' ? 'dark' : read()));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Recordar la preferencia es un lujo, no un requisito.
    }
  }, [theme]);

  const value = useMemo<ThemeValue>(
    () => ({ theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }),
    [theme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme fuera de ThemeProvider');
  return value;
}
