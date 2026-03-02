import { create } from 'zustand';

type ThemeMode = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeState {
  theme: ThemeMode;
  resolved: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
  cycleTheme: () => void;
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.setAttribute('data-theme', resolved);
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? getSystemTheme() : mode;
}

const stored = (typeof localStorage !== 'undefined' &&
  localStorage.getItem('theme')) as ThemeMode | null;
const initial: ThemeMode =
  stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'light';

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initial,
  resolved: resolveTheme(initial),

  setTheme(theme: ThemeMode) {
    const resolved = resolveTheme(theme);
    localStorage.setItem('theme', theme);

    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      (
        document as unknown as { startViewTransition: (cb: () => void) => void }
      ).startViewTransition(() => {
        applyTheme(resolved);
        set({ theme, resolved });
      });
    } else {
      applyTheme(resolved);
      set({ theme, resolved });
    }
  },

  cycleTheme() {
    const order: ThemeMode[] = ['light', 'dark', 'system'];
    const idx = order.indexOf(get().theme);
    const next = order[(idx + 1) % order.length];
    get().setTheme(next);
  },
}));

// Apply initial theme
if (typeof document !== 'undefined') {
  applyTheme(resolveTheme(initial));
}

// Listen for system theme changes
if (typeof window !== 'undefined') {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener('change', () => {
    const state = useThemeStore.getState();
    if (state.theme === 'system') {
      const resolved = getSystemTheme();
      applyTheme(resolved);
      useThemeStore.setState({ resolved });
    }
  });

  // Keyboard shortcut: Cmd+Shift+T
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'T') {
      e.preventDefault();
      useThemeStore.getState().cycleTheme();
    }
  });
}
