/**
 * CLI argument parsing.
 *
 * Handles boolean flags, value flags, positional args, `--` separator, and `--help`.
 */

export const BOOLEAN_FLAGS = new Set([
  '--archived',
  '--silent',
  '--no-preview',
  '--revoke',
  '--reverse',
  '--all',
  '--md',
  '--html',
  '--big',
  '--stdin',
  '--remove',
  '--incoming',
  '--download-media',
  '--full',
  '--unread',

  '--transcribe',
]);

export function parseArgs(raw: string[]): {
  positional: string[];
  flags: Record<string, string>;
} {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  let endOfFlags = false;

  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i] as string;
    if (endOfFlags) {
      positional.push(arg);
      continue;
    }
    if (arg === '--') {
      endOfFlags = true;
      continue;
    }
    if (arg === '--help') {
      flags['--help'] = 'true';
    } else if (arg.startsWith('--')) {
      // Support --flag=value syntax
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        const key = arg.slice(0, eqIdx);
        flags[key] = arg.slice(eqIdx + 1);
      } else {
        const next = raw[i + 1];
        if (BOOLEAN_FLAGS.has(arg) || i + 1 >= raw.length || next?.startsWith('--')) {
          flags[arg] = 'true';
        } else {
          flags[arg] = next as string;
          i++;
        }
      }
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags };
}
