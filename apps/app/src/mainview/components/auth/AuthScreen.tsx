import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import {
  type AuthStep,
  formatTelegramError,
  initialize,
  isAuthorized,
  onAuthUpdate,
  resendCode,
  submitCode,
  submitPassword,
  submitPhone,
} from '@/data/telegram';
import { telegramLog } from '@/lib/log';

type Step = 'connecting' | AuthStep;

export function AuthScreen({ onSuccess }: { onSuccess: () => void }) {
  const [step, setStep] = useState<Step>('connecting');
  const [error, setError] = useState('');
  const [passwordHint, setPasswordHint] = useState('');
  const [loading, setLoading] = useState(false);

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [codeViaApp, setCodeViaApp] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const started = useRef(false);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    boot();
  }, []);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  // Subscribe to auth state updates via SSE
  useEffect(() => {
    const unsub = onAuthUpdate((event) => {
      telegramLog.info(`Auth SSE: ${event.step}`);
      setLoading(false);
      setError('');

      switch (event.step) {
        case 'phone':
          setStep('phone');
          break;
        case 'code':
          setStep('code');
          setCodeViaApp(event.codeViaApp);
          setResendCountdown(60);
          break;
        case 'password':
          setStep('password');
          setPasswordHint(event.hint);
          break;
        case 'ready':
          onSuccessRef.current();
          break;
      }
    });
    return unsub;
  }, []);

  async function boot() {
    telegramLog.info('AuthScreen: boot');
    setStep('connecting');
    try {
      await initialize();
      if (await isAuthorized()) {
        onSuccessRef.current();
        return;
      }
      // Not yet authorized — default to phone step; SSE will correct if different
      setStep('phone');
    } catch (err) {
      telegramLog.error('AuthScreen: boot error:', err);
      setError(formatTelegramError(err));
      setStep('phone');
    }
  }

  async function handlePhone(e: FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setError('');
    setLoading(true);
    try {
      await submitPhone(phone.trim());
    } catch (err) {
      setError(formatTelegramError(err));
      setLoading(false);
    }
  }

  async function handleCode(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setError('');
    setLoading(true);
    try {
      await submitCode(code.trim());
    } catch (err) {
      setError(formatTelegramError(err));
      setLoading(false);
    }
  }

  async function handleResendCode() {
    setError('');
    setResendCountdown(60);
    try {
      await resendCode();
    } catch (err) {
      setError(formatTelegramError(err));
    }
  }

  async function handlePassword(e: FormEvent) {
    e.preventDefault();
    if (!password) return;
    setError('');
    setLoading(true);
    try {
      await submitPassword(password);
    } catch (err) {
      setError(formatTelegramError(err));
      setLoading(false);
    }
  }

  if (step === 'connecting') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-text-secondary animate-pulse">Connecting to Telegram...</p>
      </div>
    );
  }

  const codeDescription = codeViaApp
    ? 'Check your Telegram app on another device for the code'
    : 'A code was sent to you via SMS';

  const descriptions: Record<string, string> = {
    phone: 'Enter your phone number with country code',
    code: codeDescription,
    password: 'Enter your two-factor authentication password',
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Telegram AI</CardTitle>
          <CardDescription className="text-text-tertiary">{descriptions[step]}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'phone' && (
            <form onSubmit={handlePhone} className="space-y-3">
              <PhoneInput
                value={phone}
                onChange={(value) => setPhone(value ?? '')}
                defaultCountry="US"
                placeholder="Phone number"
                autoFocus
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending code...' : 'Send code'}
              </Button>
            </form>
          )}

          {step === 'code' && (
            <form onSubmit={handleCode} className="space-y-3">
              <Input
                placeholder="12345"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Verifying...' : 'Verify'}
              </Button>
              <button
                type="button"
                onClick={handleResendCode}
                disabled={resendCountdown > 0}
                className="w-full text-center text-sm text-text-tertiary hover:text-text-secondary disabled:opacity-50 disabled:cursor-default"
              >
                {resendCountdown > 0 ? `Resend code in ${resendCountdown}s` : 'Resend code'}
              </button>
            </form>
          )}

          {step === 'password' && (
            <form onSubmit={handlePassword} className="space-y-3">
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              {passwordHint && <p className="text-xs text-text-quaternary">Hint: {passwordHint}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Checking...' : 'Submit'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      {error && (
        <div className="mt-3 w-full max-w-sm rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-error-text">
          {error}
        </div>
      )}
    </div>
  );
}
