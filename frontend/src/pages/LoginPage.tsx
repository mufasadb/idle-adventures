import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate } from 'react-router-dom';
import { authStore } from '../stores/authStore';

export const LoginPage = observer(() => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (mode === 'login') {
        await authStore.login(username, password);
      } else {
        await authStore.register(username, password);
      }
      navigate('/');
    } catch {
      // error displayed via authStore.error
    }
  }

  return (
    <div className="min-h-screen bg-app-primary flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⚔️</div>
          <h1 className="text-app-primary text-2xl font-bold">Idle Adventures</h1>
          <p className="text-app-muted text-sm mt-1">Your journey awaits</p>
        </div>

        <div className="bg-app-secondary rounded-2xl p-6 space-y-4">
          <div className="flex rounded-xl bg-app-tertiary p-1 gap-1">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mode === m
                    ? 'bg-accent text-white'
                    : 'text-app-muted hover:text-app-primary'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-app-tertiary border border-app rounded-xl px-4 py-3 text-app-primary placeholder-app-muted text-sm outline-none focus:border-accent"
              autoComplete="username"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-app-tertiary border border-app rounded-xl px-4 py-3 text-app-primary placeholder-app-muted text-sm outline-none focus:border-accent"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />

            {authStore.error && (
              <p className="text-red-400 text-xs">{authStore.error}</p>
            )}

            <button
              type="submit"
              disabled={authStore.isLoading || !username || !password}
              className="w-full py-3 rounded-xl bg-accent text-white font-bold text-sm disabled:opacity-40 transition-opacity"
            >
              {authStore.isLoading
                ? 'Loading...'
                : mode === 'login'
                ? 'Sign In'
                : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
});
