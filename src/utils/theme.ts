export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'chickenland_theme_v1';

export function isValidThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isValidThemeMode(saved)) {
      return saved;
    }
  } catch {
    // Ignore storage errors
  }
  return 'light';
}

export function applyThemeToDocument(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const isDark = theme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function setStoredTheme(theme: ThemeMode): void {
  if (!isValidThemeMode(theme)) return;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors
    }
  }
  applyThemeToDocument(theme);
}
