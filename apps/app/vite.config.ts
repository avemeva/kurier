import { appendFileSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
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

export default defineConfig({
  plugins: [react(), tailwindcss(), sessionPlugin(), logPlugin()],
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
    },
  },
});
