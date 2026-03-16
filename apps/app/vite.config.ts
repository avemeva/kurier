import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import { formatLogLine, type LogEntry } from './src/shared/logger';

const APP_DIR = path.join(homedir(), 'Library', 'Application Support', 'dev.telegramai.app');

/** Vite dev middleware that serves the session file at /api/session.
 *  Same file path as the Electrobun RPC handlers → single source of truth. */
function sessionPlugin(): Plugin {
  const file = path.join(APP_DIR, 'tg_session');

  return {
    name: 'session-api',
    configureServer(server) {
      server.middlewares.use('/api/session', (req, res) => {
        if (req.method === 'GET') {
          try {
            res.end(readFileSync(file, 'utf-8'));
          } catch {
            res.end('');
          }
          return;
        }
        if (req.method === 'PUT') {
          let body = '';
          req.on('data', (chunk: Buffer) => {
            body += chunk.toString();
          });
          req.on('end', () => {
            mkdirSync(APP_DIR, { recursive: true });
            writeFileSync(file, body, 'utf-8');
            res.end('ok');
          });
          return;
        }
        if (req.method === 'DELETE') {
          try {
            unlinkSync(file);
          } catch {
            // File may not exist
          }
          res.end('ok');
          return;
        }
        res.statusCode = 405;
        res.end('Method not allowed');
      });
    },
  };
}

const MAX_LOG_BODY = 8192;
const LOG_FILE = path.resolve(__dirname, '.logs/dev.log');

function logPlugin(): Plugin {
  return {
    name: 'log-api',
    configureServer(server) {
      mkdirSync(path.dirname(LOG_FILE), { recursive: true });
      writeFileSync(LOG_FILE, '');
      server.middlewares.use('/api/log', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        let exceeded = false;
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString();
          if (body.length > MAX_LOG_BODY) exceeded = true;
        });
        req.on('end', () => {
          if (exceeded) {
            res.statusCode = 413;
            res.end();
            return;
          }
          try {
            const entry = JSON.parse(body) as LogEntry;
            const line = formatLogLine(entry);
            process.stdout.write(`${line}\n`);
            appendFileSync(LOG_FILE, `${line}\n`);
          } catch {}
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

/** Vite dev middleware that serves dev.html for /dev and /dev/* routes.
 *  Excludes /dev/fixtures/*, /dev/media/*, /dev/photos/* so static assets pass through.
 *  Runs BEFORE Vite's built-in SPA fallback (which would serve index.html). */
function devHarnessPlugin(): Plugin {
  const devHtmlPath = path.resolve(__dirname, 'src/mainview/dev.html');

  return {
    name: 'dev-harness',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0]; // strip query params for matching
        const isDevRoute =
          url === '/dev' ||
          url === '/dev/' ||
          (url.startsWith('/dev/') &&
            !url.startsWith('/dev/fixtures/') &&
            !url.startsWith('/dev/media/') &&
            !url.startsWith('/dev/photos/'));
        // Don't intercept source file requests (Vite module imports)
        const hasFileExt = /\.\w+$/.test(url);
        if (isDevRoute && !hasFileExt) {
          const raw = readFileSync(devHtmlPath, 'utf-8');
          const html = await server.transformIndexHtml(url, raw);
          res.setHeader('Content-Type', 'text/html');
          res.statusCode = 200;
          res.end(html);
          return;
        }
        next();
      });
    },
  };
}

const FIXTURES_DIR = path.resolve(__dirname, 'src/mainview/public/dev/fixtures');
const MANIFEST_PATH = path.join(FIXTURES_DIR, 'manifest.json');
const MAX_FIXTURE_BODY = 50 * 1024 * 1024; // 50 MB (media can be large)

/** Vite dev middleware that handles POST /api/dev/fixture.
 *  Writes fixture folder + media files, updates manifest.json. */
function fixtureWriterPlugin(): Plugin {
  return {
    name: 'fixture-writer',
    configureServer(server) {
      server.middlewares.use('/api/dev/fixture', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        let body = '';
        let exceeded = false;
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString();
          if (body.length > MAX_FIXTURE_BODY) exceeded = true;
        });
        req.on('end', () => {
          if (exceeded) {
            res.statusCode = 413;
            res.end(JSON.stringify({ error: 'Payload too large' }));
            return;
          }

          try {
            const { name, fixture, media } = JSON.parse(body) as {
              name: string;
              fixture: { message: unknown; showSender: boolean; groupPosition: string };
              media?: Record<string, string>[];
            };

            if (!name || !fixture) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Missing name or fixture' }));
              return;
            }

            // Create fixture folder
            const fixtureDir = path.join(FIXTURES_DIR, name);
            mkdirSync(fixtureDir, { recursive: true });

            // Write fixture.json
            writeFileSync(
              path.join(fixtureDir, 'fixture.json'),
              JSON.stringify(fixture, null, 2),
              'utf-8',
            );

            // Write media files
            if (media && Array.isArray(media)) {
              for (const mediaEntry of media) {
                for (const [filename, dataUrl] of Object.entries(mediaEntry)) {
                  const mediaDir = path.join(fixtureDir, 'media');
                  mkdirSync(mediaDir, { recursive: true });
                  // dataUrl format: "data:<mime>;base64,<data>"
                  const base64Data = dataUrl.split(',')[1];
                  if (base64Data) {
                    writeFileSync(path.join(mediaDir, filename), Buffer.from(base64Data, 'base64'));
                  }
                }
              }
            }

            // Update manifest.json
            type ManifestEntry = { name: string; description: string; contentKind: string };
            let manifest: ManifestEntry[] = [];
            if (existsSync(MANIFEST_PATH)) {
              try {
                manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as ManifestEntry[];
              } catch {
                manifest = [];
              }
            }

            const fixtureData = fixture as {
              message: { content?: { kind?: string } };
              showSender: boolean;
              groupPosition: string;
            };
            const contentKind =
              (fixtureData.message?.content as { kind?: string })?.kind ?? 'unknown';
            const existingIdx = manifest.findIndex((e) => e.name === name);
            const entry: ManifestEntry = {
              name,
              description: `Captured: ${name}`,
              contentKind,
            };
            if (existingIdx >= 0) {
              manifest[existingIdx] = entry;
            } else {
              manifest.push(entry);
            }
            writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');

            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(JSON.stringify({ success: true }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    sessionPlugin(),
    logPlugin(),
    devHarnessPlugin(),
    fixtureWriterPlugin(),
  ],
  root: 'src/mainview',
  publicDir: path.resolve(__dirname, 'src/mainview/public'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/mainview'),
    },
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    target: 'esnext',
  },
  server: {
    port: 5173,
    proxy: {
      '/api/tg': 'http://localhost:7312',
      '/api/media': 'http://localhost:7312',
      '/api/open': 'http://localhost:7312',
    },
  },
});
