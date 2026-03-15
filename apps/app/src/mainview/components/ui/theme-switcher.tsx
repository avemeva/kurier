import { Monitor, Moon, Palette, Sun } from 'lucide-react';
import { COLOR_THEMES, type ColorTheme, useThemeStore } from '@/lib/theme';
import { Button } from './button';

const COLOR_THEME_LABELS: Record<ColorTheme, string> = {
  default: 'Default',
  catppuccin: 'Catppuccin',
  'catppuccin-v1': 'Catppuccin v1',
};

export function ThemeSwitcher() {
  const theme = useThemeStore((s) => s.theme);
  const colorTheme = useThemeStore((s) => s.colorTheme);
  const cycleTheme = useThemeStore((s) => s.cycleTheme);
  const setColorTheme = useThemeStore((s) => s.setColorTheme);

  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const label = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System';

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={cycleTheme}
        aria-label={`Theme: ${label}. Click to change.`}
        title={`Theme: ${label}`}
      >
        <Icon size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => {
          const idx = COLOR_THEMES.indexOf(colorTheme);
          const next = COLOR_THEMES[(idx + 1) % COLOR_THEMES.length];
          setColorTheme(next);
        }}
        aria-label={`Color theme: ${COLOR_THEME_LABELS[colorTheme]}`}
        title={`Color theme: ${COLOR_THEME_LABELS[colorTheme]}`}
      >
        <Palette size={14} />
      </Button>
    </div>
  );
}
