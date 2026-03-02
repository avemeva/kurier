import { useEffect } from 'react';
import { useChatStore } from '@/lib/store';
import { ChatHeader } from './ChatHeader';
import { ChatSidebar } from './ChatSidebar';
import { ComposeSearchTopBar, useChatSearchKeyboard } from './ComposeSearch';
import { MessagePanel } from './MessagePanel';

export function ChatLayout({ onLogout }: { onLogout: () => void }) {
  const loadDialogs = useChatStore((s) => s.loadDialogs);
  const error = useChatStore((s) => s.error);
  const clearError = useChatStore((s) => s.clearError);
  const searchMode = useChatStore((s) => s.searchMode);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount
  useEffect(() => {
    loadDialogs();
  }, []);

  useChatSearchKeyboard();

  const isChatSearch = searchMode === 'chat';

  return (
    <div data-testid="chat-layout" className="flex h-screen bg-background">
      <ChatSidebar onLogout={onLogout} />

      <div className="flex flex-1 flex-col">
        {isChatSearch ? <ComposeSearchTopBar /> : <ChatHeader />}
        <MessagePanel />
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
