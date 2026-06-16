// frontend/lib/theme.js — Dark mode context + hook.
//
// Applies/removes class="dark" on <html>.  Persists choice to localStorage.
// Initialised from:  localStorage → system preference → 'light'.
//
// Usage:
//   const { theme, toggle } = useTheme();

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

/** @typedef {'light'|'dark'} Theme */

<<<<<<< HEAD
const ThemeContext = createContext(/** @type {{ theme: Theme, toggle: () => void }} */ ({}));
=======
const ThemeContext = createContext(
  /** @type {{ theme: Theme, toggle: () => void }} */ ({}),
);
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b

const STORAGE_KEY = 'wolf_theme';

/** Returns the initial theme — system preference when no stored value. */
function resolveInitialTheme() {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** @param {{ children: React.ReactNode }} props */
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light');

  // Hydrate after mount to avoid SSR mismatch.
  useEffect(() => {
    setTheme(resolveInitialTheme());
  }, []);

  // Sync class on <html> + persist.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

<<<<<<< HEAD
  const toggle = useCallback(() => setTheme(t => (t === 'dark' ? 'light' : 'dark')), []);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
=======
  const toggle = useCallback(
    () => setTheme(t => (t === 'dark' ? 'light' : 'dark')),
    [],
  );

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
>>>>>>> e83552a2128b90ebc9cc2e6071a3f37a9bbf5c2b
}

/** @returns {{ theme: Theme, toggle: () => void }} */
export function useTheme() {
  return useContext(ThemeContext);
}
