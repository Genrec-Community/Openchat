import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

const GoogleCallbackPage: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing Google authentication...');
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [processed, setProcessed] = useState(false);
  const { handleGoogleCallback } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Prevent multiple processing
    if (processed) return;
    
    const processCallback = async () => {
      try {
        console.log('🔄 Starting Google callback processing...');
        setProcessed(true);
        setStatus('loading');
        setMessage('Verifying your Google account...');
        setDebugInfo('Checking OAuth session...');

        const result = await handleGoogleCallback();
        console.log('🔄 Callback result:', result);

        if (result.success) {
          console.log('✅ Authentication successful');
          setStatus('success');
          setMessage('Successfully signed in with Google!');
          setDebugInfo(`Welcome ${result.data?.display_name || result.data?.username}!`);
          
          // Redirect immediately for better UX
          setTimeout(() => {
            navigate('/chat', { replace: true });
          }, 1000);
        } else {
          console.error('❌ Authentication failed:', result.error);
          setStatus('error');
          setMessage(result.error || 'Failed to authenticate with Google');
          setDebugInfo(result.error || 'Unknown error occurred');
          setProcessed(false); // Allow retry
        }
      } catch (error: any) {
        console.error('❌ Unexpected error in callback:', error);
        setStatus('error');
        setMessage('An unexpected error occurred during authentication');
        setDebugInfo(`Error: ${error.message || error}`);
        setProcessed(false); // Allow retry
      }
    };

    // Set a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      if (status === 'loading' && !processed) {
        console.error('❌ Callback processing timed out');
        setStatus('error');
        setMessage('Authentication process timed out');
        setDebugInfo('The authentication process took too long. Please try again.');
        setProcessed(false); // Allow retry
      }
    }, 15000); // Reduced to 15 seconds

    const timer = setTimeout(processCallback, 100); // Faster start
    
    return () => {
      clearTimeout(timer);
      clearTimeout(timeoutId);
    };
  }, [handleGoogleCallback, navigate, processed]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 dark:from-zinc-900 dark:via-zinc-800 dark:to-zinc-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-zinc-800 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-700 p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
            Google Authentication
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Completing your sign-in process
          </p>
        </div>

        <div className="text-center">
          {status === 'loading' && (
            <div className="space-y-6">
              <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto" />
              <p className="text-lg font-medium text-zinc-900 dark:text-white">
                {message}
              </p>
              {debugInfo && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {debugInfo}
                </p>
              )}
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-6">
              <CheckCircle className="w-12 h-12 text-green-600 mx-auto" />
              <p className="text-lg font-medium text-zinc-900 dark:text-white">
                {message}
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Redirecting you to the chat...
              </p>
              <button
                onClick={() => navigate('/chat', { replace: true })}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-4 rounded-lg font-medium transition-colors"
              >
                Continue to Chat
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-6">
              <XCircle className="w-12 h-12 text-red-600 mx-auto" />
              <p className="text-lg font-medium text-zinc-900 dark:text-white">
                Authentication Failed
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {message}
              </p>
              {debugInfo && (
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded">
                  Debug: {debugInfo}
                </p>
              )}
              <button
                onClick={() => navigate('/login', { replace: true })}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-4 rounded-lg font-medium transition-colors"
              >
                Back to Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GoogleCallbackPage;