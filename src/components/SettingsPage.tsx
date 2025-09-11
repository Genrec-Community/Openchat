import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Settings, User, Palette, Save, Crown, Shield, Clock, Sun, Moon } from 'lucide-react';

const SettingsPage: React.FC = () => {
  const { user, isOP, updateUser } = useAuth();
  const [username, setUsername] = useState(user?.username || '');
  const [theme, setTheme] = useState(user?.theme || 'light');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim()) {
      setMessage('Username cannot be empty');
      return;
    }

    setSaving(true);
    setMessage('');

    try {
      await updateUser({
        username: username.trim(),
        theme: theme as 'light' | 'dark',
      });
      
      setMessage('Settings saved successfully!');
      
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (error) {
      console.error('Error updating settings:', error);
      setMessage('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 3000); // Clear message after 3 seconds
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-zinc-100 dark:bg-zinc-900">
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-8">
          <div className="flex items-center space-x-4 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg">
              <Settings className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Settings</h1>
              <p className="text-zinc-600 dark:text-zinc-400">Customize your anonymous chat experience</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-700 p-6 sticky top-6">
              <div className="text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-zinc-500 to-zinc-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <span className="text-white font-bold text-2xl">
                    {user?.username?.charAt(0)?.toUpperCase()}
                  </span>
                </div>
                
                <div className="flex items-center justify-center space-x-2 mb-2">
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-white">{user?.username}</h3>
                  {isOP && (
                    <div className="flex items-center space-x-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/40 rounded-full">
                      <Crown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-300">OP</span>
                    </div>
                  )}
                </div>
                
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
                  {isOP ? 'Chat Moderator' : 'Anonymous Member'}
                </p>
                
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between p-3 bg-zinc-100 dark:bg-zinc-700/50 rounded-xl">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-zinc-500" />
                      <span className="text-zinc-600 dark:text-zinc-400">Member since</span>
                    </div>
                    <span className="text-zinc-900 dark:text-white font-medium">
                      {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-zinc-100 dark:bg-zinc-700/50 rounded-xl">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-zinc-600 dark:text-zinc-400">Status</span>
                    </div>
                    <span className="text-green-600 dark:text-green-400 font-medium">Online</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <form onSubmit={handleSave} className="space-y-6">
              <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-700 p-6">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center">
                    <User className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Profile Settings</h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">Update your display name and preferences</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label htmlFor="username" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Username</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="h-5 w-5 text-zinc-400" />
                      </div>
                      <input type="text" id="username" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-zinc-50 dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-xl text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200" placeholder="Enter your username" maxLength={50} disabled={saving} />
                    </div>
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">This name will be visible to other users in the chat.</p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-700 p-6">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center">
                    <Palette className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Appearance</h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">Choose your preferred theme</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-4">Theme Preference</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <label className="relative cursor-pointer">
                        <input type="radio" name="theme" value="light" checked={theme === 'light'} onChange={(e) => setTheme(e.target.value as 'light' | 'dark')} className="sr-only" disabled={saving} />
                        <div className={`p-4 border-2 rounded-xl transition-all duration-200 ${theme === 'light' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 shadow-md' : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'}`}>
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-white border-2 border-zinc-200 rounded-xl flex items-center justify-center shadow-sm"><Sun className="w-5 h-5 text-amber-500" /></div>
                            <div>
                              <div className="font-semibold text-zinc-900 dark:text-white">Light</div>
                              <div className="text-sm text-zinc-600 dark:text-zinc-400">Clean and bright</div>
                            </div>
                          </div>
                        </div>
                      </label>
                      
                      <label className="relative cursor-pointer">
                        <input type="radio" name="theme" value="dark" checked={theme === 'dark'} onChange={(e) => setTheme(e.target.value as 'light' | 'dark')} className="sr-only" disabled={saving} />
                        <div className={`p-4 border-2 rounded-xl transition-all duration-200 ${theme === 'dark' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 shadow-md' : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'}`}>
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-zinc-800 border-2 border-zinc-700 rounded-xl flex items-center justify-center shadow-sm"><Moon className="w-5 h-5 text-indigo-400" /></div>
                            <div>
                              <div className="font-semibold text-zinc-900 dark:text-white">Dark</div>
                              <div className="text-sm text-zinc-600 dark:text-zinc-400">Easy on the eyes</div>
                            </div>
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 border border-green-200 dark:border-green-800 rounded-2xl p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 bg-green-100 dark:bg-green-900/40 rounded-xl flex items-center justify-center"><Shield className="w-5 h-5 text-green-600 dark:text-green-400" /></div>
                  <h4 className="text-lg font-semibold text-green-900 dark:text-green-100">Privacy Protection</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center space-x-2"><div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div><span className="text-green-800 dark:text-green-200">Messages auto-delete after 24 hours</span></div>
                  <div className="flex items-center space-x-2"><div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div><span className="text-green-800 dark:text-green-200">End-to-end encrypted communication</span></div>
                  <div className="flex items-center space-x-2"><div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div><span className="text-green-800 dark:text-green-200">No personal data collection</span></div>
                  <div className="flex items-center space-x-2"><div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div><span className="text-green-800 dark:text-green-200">Anonymous and temporary chats</span></div>
                </div>
              </div>

              {message && (
                <div className={`p-4 rounded-xl border-l-4 transition-all ${message.includes('successfully') ? 'bg-green-50 dark:bg-green-900/30 border-green-500 text-green-800 dark:text-green-200' : 'bg-red-50 dark:bg-red-900/30 border-red-500 text-red-800 dark:text-red-200'}`}>
                  <div className="flex items-center space-x-2">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${message.includes('successfully') ? 'bg-green-500' : 'bg-red-500'}`}>
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d={message.includes('successfully') ? "M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" : "M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"} clipRule="evenodd" /></svg>
                    </div>
                    <span className="font-medium">{message}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-6 border-t border-zinc-200 dark:border-zinc-700">
                <div className="text-sm text-zinc-600 dark:text-zinc-400">Changes are saved automatically to your browser.</div>
                <button type="submit" disabled={saving || !username.trim()} className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-800">
                  {saving ? (<><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>Saving...</>) : (<><Save className="w-5 h-5 mr-2" />Save Changes</>)}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;