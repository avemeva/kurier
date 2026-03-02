import { Monitor, Moon, Sun } from 'lucide-react';
import { useThemeStore } from '@/lib/theme';
import { Button } from './button';

export function ThemeSwitcher() {
  const theme = useThemeStore((s) => s.theme);
  const cycleTheme = useThemeStore((s) => s.cycleTheme);

  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const label = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System';

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={cycleTheme}
      aria-label={`Theme: ${label}. Click to change.`}
      title={`Theme: ${label}`}
    >
      <Icon size={14} />
    </Button>
  );
}
