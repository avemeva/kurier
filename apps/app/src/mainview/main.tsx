import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '@/components/ui/tooltip';
import { log } from '@/lib/log';
import type { AppRPCSchema } from '../shared/rpc-schema';
import './index.css';
import App from './app';

window.addEventListener('error', (event) => {
  log.error('Uncaught:', event.error ?? event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  log.error('Unhandled rejection:', event.reason);
});

// Wrap in async IIFE so the Electrobun RPC is wired up before React renders,
// without requiring top-level await (unsupported by the production build target).
(async () => {
  if (window.__electrobunWebviewId) {
    const { Electroview } = await import(/* @vite-ignore */ 'electrobun/view');
    const rpc = Electroview.defineRPC<AppRPCSchema>({ handlers: {} });
    new Electroview({ rpc });
  }

  const root = document.getElementById('root');
  if (root) {
    createRoot(root).render(
      <StrictMode>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </StrictMode>,
    );
  }
})();
