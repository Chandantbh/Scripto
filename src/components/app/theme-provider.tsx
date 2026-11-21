'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('scripto-theme');
    const initialTheme: Theme =
      savedTheme === 'light' || savedTheme === 'dark'
        ? savedTheme
        : document.documentElement.classList.contains('dark')
          ? 'dark'
          : 'light';

    setThemeState(initialTheme);
  }, []);

  const setTheme = (nextTheme: Theme) => {
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    document.documentElement.style.colorScheme = nextTheme;
    window.localStorage.setItem('scripto-theme', nextTheme);
    setThemeState(nextTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
