import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { log } from '@/lib/log';
import type { AppRPCSchema } from '../shared/rpc-schema';
import './index.css';
import App from './App';

window.addEventListener('error', (event) => {
  log.error('Uncaught:', event.error ?? event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  log.error('Unhandled rejection:', event.reason);
});

const DevPage = lazy(() => import('./pages/DevPage'));

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
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<App />} />
              <Route
                path="/dev"
                element={
                  <Suspense
                    fallback={
                      <div className="flex min-h-screen items-center justify-center bg-background">
                        <p className="animate-pulse text-text-secondary">Loading dev page...</p>
                      </div>
                    }
                  >
                    <DevPage />
                  </Suspense>
                }
              />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </StrictMode>,
    );
  }
})();
