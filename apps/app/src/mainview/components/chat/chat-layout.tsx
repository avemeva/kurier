import { useEffect } from 'react';
import { useChatStore } from '@/data';
import { cn } from '@/lib/utils';
import { ChatHeader } from './chat-header';
import { ChatSidebar } from './chat-sidebar';
import { ChatView } from './chat-view';
import { ComposeSearchTopBar, useChatSearchKeyboard } from './compose-search';

export function ChatLayout({ onLogout }: { onLogout: () => void }) {
  const loadDialogs = useChatStore((s) => s.loadDialogs);
  const error = useChatStore((s) => s.error);
  const clearError = useChatStore((s) => s.clearError);
  const searchMode = useChatStore((s) => s.searchMode);
  const selectedChatId = useChatStore((s) => s.selectedChatId);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount
  useEffect(() => {
    loadDialogs();
  }, []);

  useChatSearchKeyboard();

  const isChatSearch = searchMode === 'chat';

  return (
    <div data-testid="chat-layout" className="flex h-screen bg-background">
      <div className={cn('h-full overflow-hidden md:block', selectedChatId ? 'hidden' : 'block')}>
        <ChatSidebar onLogout={onLogout} />
      </div>

      <div className={cn('flex-1 flex-col', selectedChatId ? 'flex' : 'hidden md:flex')}>
        {isChatSearch ? <ComposeSearchTopBar /> : <ChatHeader />}
        <ChatView />
      </div>

      {error && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-destructive/10 px-4 py-2 text-sm text-error-text shadow-md">
          {error}
          <button
            type="button"
            onClick={clearError}
            className="ml-3 font-medium text-error-text hover:text-error-text/80"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
