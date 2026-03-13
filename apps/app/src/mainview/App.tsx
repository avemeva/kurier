import { Agentation } from 'agentation';
import { useEffect, useState } from 'react';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { ChatLayout } from '@/components/chat/ChatLayout';
import { initialize, isAuthorized, logout } from '@/data/telegram';

type Screen = 'loading' | 'auth' | 'chat';

function App() {
  const [screen, setScreen] = useState<Screen>('loading');

  useEffect(() => {
    async function boot() {
      try {
        await initialize();
        const authed = await isAuthorized();
        setScreen(authed ? 'chat' : 'auth');
      } catch {
        setScreen('auth');
      }
    }
    boot();
  }, []);

  if (screen === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-text-secondary animate-pulse">Connecting...</p>
      </div>
    );
  }

  if (screen === 'auth') {
    return <AuthScreen onSuccess={() => setScreen('chat')} />;
  }

  return (
    <>
      <ChatLayout
        onLogout={async () => {
          await logout();
          setScreen('auth');
        }}
      />
      {import.meta.env.DEV && <Agentation />}
    </>
  );
}

export default App;
