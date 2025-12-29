import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate } from 'react-router-dom';
import { authStore } from '../stores/authStore';

export const LoginPage = observer(() => {
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (isRegister) {
        await authStore.register(email, username, password);
      } else {
        await authStore.login(email, password);
      }
      navigate('/');
    } catch {
      // Error is handled by the store
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-amber-400 text-center mb-2">
          Idle Adventures
        </h1>
        <p className="text-gray-400 text-center mb-8">
          {isRegister ? 'Create your account' : 'Welcome back, adventurer'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-700 text-white rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
              required
            />
          </div>

          {isRegister && (
            <div>
              <label className="block text-gray-300 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-gray-700 text-white rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
                required
                minLength={3}
              />
            </div>
          )}

          <div>
            <label className="block text-gray-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-700 text-white rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
              required
              minLength={6}
            />
          </div>

          {authStore.error && (
            <div className="text-red-400 text-sm">{authStore.error}</div>
          )}

          <button
            type="submit"
            disabled={authStore.isLoading}
            className="w-full bg-amber-500 hover:bg-amber-600 text-gray-900 font-bold py-2 px-4 rounded disabled:opacity-50 transition-colors"
          >
            {authStore.isLoading
              ? 'Loading...'
              : isRegister
              ? 'Create Account'
              : 'Login'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => setIsRegister(!isRegister)}
            className="text-amber-400 hover:text-amber-300"
          >
            {isRegister
              ? 'Already have an account? Login'
              : "Don't have an account? Register"}
          </button>
        </div>
      </div>
    </div>
  );
});
