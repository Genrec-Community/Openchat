import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { MessageCircle, Mail, Lock, User, UserPlus, Coffee } from 'lucide-react';
import type { LoginCredentials } from '../types';

type LoginMode = 'login' | 'register' | 'guest';

const LoginPage: React.FC = () => {
  const [mode, setMode] = useState<LoginMode>('guest');
  const [credentials, setCredentials] = useState<LoginCredentials>({ email: '', password: '' });
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const { loginWithEmail, loginAsGuest, registerUser, signInWithGoogle, signUpWithGoogle } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      let result;
      
      switch (mode) {
        case 'guest':
          result = await loginAsGuest();
          break;
        case 'login':
          result = await loginWithEmail(credentials);
          break;
        case 'register':
          result = await registerUser(credentials.email, credentials.password, displayName);
          break;
      }

      if (result.success) {
        setSuccess(result.message || 'Success!');
      } else {
        setError(result.error || 'An error occurred');
      }
    } catch (error: any) {
      setError(error.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleModeSwitch = (newMode: LoginMode) => {
    setMode(newMode);
    setError('');
    setSuccess('');
    setCredentials({ email: '', password: '' });
    setDisplayName('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 dark:from-zinc-900 dark:via-zinc-800 dark:to-zinc-900 flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg">
              <MessageCircle className="w-8 h-8 text-white" />
            </div>
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-zinc-900 dark:text-white">
            Welcome to OpenChat
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Choose how you'd like to join the conversation
          </p>
        </div>

        {/* Mode Selection */}
        <div className="flex space-x-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
          <button
            onClick={() => handleModeSwitch('guest')}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all duration-200 ${
              mode === 'guest'
                ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Coffee className="w-4 h-4 inline mr-1" />
            Guest
          </button>
          <button
            onClick={() => handleModeSwitch('login')}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all duration-200 ${
              mode === 'login'
                ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <User className="w-4 h-4 inline mr-1" />
            Sign In
          </button>
          <button
            onClick={() => handleModeSwitch('register')}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all duration-200 ${
              mode === 'register'
                ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <UserPlus className="w-4 h-4 inline mr-1" />
            Sign Up
          </button>
        </div>

        {/* Google OAuth Section */}
        {(mode === 'login' || mode === 'register') && (
          <div className="space-y-4">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-300 dark:border-zinc-600" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400">
                  Or continue with
                </span>
              </div>
            </div>
            
            <button
              type="button"
              onClick={async () => {
                setLoading(true);
                setError('');
                try {
                  const result = mode === 'register' 
                    ? await signUpWithGoogle()
                    : await signInWithGoogle();
                  
                  if (!result.success) {
                    setError(result.error || 'Google authentication failed');
                  }
                } catch (error: any) {
                  setError(error.message || 'Failed to authenticate with Google');
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
              className="w-full flex justify-center items-center px-4 py-3 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="currentColor">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {loading ? 'Connecting...' : `${mode === 'register' ? 'Sign up' : 'Sign in'} with Google`}
            </button>
          </div>
        )}

        {/* Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            {mode === 'guest' && (
              <div className="text-center p-6 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <Coffee className="w-12 h-12 text-green-600 dark:text-green-400 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-green-900 dark:text-green-100 mb-2">
                  Join as Guest
                </h3>
                <p className="text-sm text-green-700 dark:text-green-300 mb-4">
                  Quick access to Direct Chat. No registration required.
                  Your session will last 24 hours.
                </p>
                <div className="text-xs text-green-600 dark:text-green-400 space-y-1">
                  <div>✓ Instant access to Direct Chat</div>
                  <div>✓ Auto-generated username</div>
                  <div>✗ Cannot create or join groups</div>
                  <div>✗ Session expires in 24 hours</div>
                </div>
              </div>
            )}

            {(mode === 'login' || mode === 'register') && (
              <>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-zinc-400" />
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={credentials.email}
                      onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
                      className="block w-full pl-10 pr-3 py-3 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                      placeholder="Enter your email"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-zinc-400" />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      required
                      value={credentials.password}
                      onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                      className="block w-full pl-10 pr-3 py-3 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                      placeholder="Enter your password"
                    />
                  </div>
                </div>

                {mode === 'register' && (
                  <div>
                    <label htmlFor="displayName" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      Display Name (Optional)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="h-5 w-5 text-zinc-400" />
                      </div>
                      <input
                        id="displayName"
                        name="displayName"
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="block w-full pl-10 pr-3 py-3 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                        placeholder="Your display name"
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {success && (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm text-green-700 dark:text-green-300">{success}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2" />
                {mode === 'guest' ? 'Creating Session...' : mode === 'login' ? 'Signing In...' : 'Creating Account...'}
              </div>
            ) : (
              <>
                {mode === 'guest' && (
                  <>
                    <Coffee className="w-5 h-5 mr-2" />
                    Join as Guest
                  </>
                )}
                {mode === 'login' && (
                  <>
                    <User className="w-5 h-5 mr-2" />
                    Sign In
                  </>
                )}
                {mode === 'register' && (
                  <>
                    <UserPlus className="w-5 h-5 mr-2" />
                    Create Account
                  </>
                )}
              </>
            )}
          </button>

          {/* Additional Info */}
          <div className="text-center space-y-2">
            {mode === 'login' && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => handleModeSwitch('register')}
                  className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  Sign up here
                </button>
              </p>
            )}
            {mode === 'register' && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => handleModeSwitch('login')}
                  className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  Sign in here
                </button>
              </p>
            )}
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              Need a quick chat? Try{' '}
              <button
                type="button"
                onClick={() => handleModeSwitch('guest')}
                className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                Guest Mode
              </button>
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className="text-center">
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            OpenChat V2 - Real-time messaging with groups and roles
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;