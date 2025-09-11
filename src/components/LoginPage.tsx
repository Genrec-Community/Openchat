import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { User, Crown, Eye, EyeOff, MessageCircle, Shield, Lock } from 'lucide-react';

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isOPMode, setIsOPMode] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!username.trim()) {
      setError('Username is required');
      setLoading(false);
      return;
    }

    if (isOPMode && !password.trim()) {
      setError('Password is required for OP login');
      setLoading(false);
      return;
    }

    try {
      const success = await login(username.trim(), isOPMode, password);
      
      if (success) {
        navigate('/chat');
      } else {
        setError(isOPMode ? 'Invalid OP credentials' : 'Failed to login');
      }
    } catch (err) {
      setError('An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  const toggleOPMode = () => {
    setIsOPMode(!isOPMode);
    setPassword('');
    setError('');
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-zinc-50 via-white to-zinc-100 dark:from-zinc-900 dark:via-zinc-800 dark:to-zinc-900 p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-indigo-400/20 to-blue-600/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-indigo-600/20 rounded-full blur-3xl animate-pulse" style={{animationDelay: '2s'}}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-indigo-400/10 to-blue-600/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '4s'}}></div>
      </div>
      
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-shadow duration-300">
            <MessageCircle className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">Welcome to OpenChat</h1>
          <p className="text-zinc-600 dark:text-zinc-400 text-base">Join secure, private conversations that respect your privacy.</p>
        </div>

        <div className="bg-white/80 dark:bg-zinc-800/80 backdrop-blur-xl rounded-3xl border border-zinc-200/50 dark:border-zinc-700/50 shadow-2xl shadow-zinc-900/10 p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Username</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><User className="h-5 w-5 text-zinc-400" /></div>
                <input id="username" name="username" type="text" required value={username} onChange={(e) => setUsername(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-zinc-50 dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-xl text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200" placeholder="Enter your username" maxLength={50} />
              </div>
            </div>

            {isOPMode && (
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2"><Crown className="h-4 w-4 text-amber-500" />OP Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Lock className="h-5 w-5 text-zinc-400" /></div>
                  <input id="password" name="password" type={showPassword ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-10 pr-12 py-3 bg-zinc-50 dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-xl text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all duration-200" placeholder="Enter OP password" />
                  <button type="button" className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl">
                <div className="flex items-center">
                  <div className="flex-shrink-0"><svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg></div>
                  <div className="ml-3"><p className="text-sm text-red-800 dark:text-red-200">{error}</p></div>
                </div>
              </div>
            )}

            <button type="submit" disabled={loading} className={`w-full flex items-center justify-center px-6 py-3 rounded-xl font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-zinc-800 ${isOPMode ? 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 focus:ring-amber-500' : 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 focus:ring-indigo-500'} disabled:opacity-50 disabled:cursor-not-allowed`}>
              {loading ? (<><svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Logging in...</>) : (<>{isOPMode && <Crown className="h-5 w-5 mr-2" />}Enter Chat{isOPMode ? ' as OP' : ''}</>)}
            </button>

            <div className="text-center">
              <button type="button" onClick={toggleOPMode} className="inline-flex items-center px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors duration-200">
                <Crown className="h-4 w-4 mr-2" />
                {isOPMode ? 'Switch to Regular Login' : 'OP Login'}
              </button>
            </div>
          </form>
        </div>

        <div className="mt-8 bg-zinc-100/50 dark:bg-zinc-800/50 backdrop-blur-sm rounded-2xl p-6 border border-zinc-200/50 dark:border-zinc-700/50">
          <div className="flex items-center justify-center mb-4"><Shield className="h-5 w-5 text-green-500 mr-2" /><span className="font-semibold text-zinc-900 dark:text-white">Privacy Protection</span></div>
          <div className="grid grid-cols-1 gap-3 text-sm text-zinc-600 dark:text-zinc-400">
            <div className="flex items-center"><div className="w-2 h-2 bg-green-500 rounded-full mr-3 animate-pulse"></div><span>Messages auto-delete after 24 hours</span></div>
            <div className="flex items-center"><div className="w-2 h-2 bg-green-500 rounded-full mr-3 animate-pulse"></div><span>End-to-end encrypted communication</span></div>
            <div className="flex items-center"><div className="w-2 h-2 bg-green-500 rounded-full mr-3 animate-pulse"></div><span>No personal data collection</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;