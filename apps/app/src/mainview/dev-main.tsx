import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DevHarness } from './dev/dev-harness';
import './index.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <TooltipProvider>
        <DevHarness />
      </TooltipProvider>
    </StrictMode>,
  );
}
