import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { HybridMessagingService } from '../services/hybridMessaging';
import { Settings, Clock, Database, BarChart3, Trash2 } from 'lucide-react';

const OperatorSettings: React.FC = () => {
  const [retentionHours, setRetentionHours] = useState(24);
  const [statistics, setStatistics] = useState({
    totalMessages: 0,
    messagesLast24h: 0,
    averageRetentionHours: 24,
    nextCleanupTime: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  
  const { user, isOperator } = useAuth();

  useEffect(() => {
    if (isOperator && user) {
      loadData();
    }
  }, [isOperator, user]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load current retention settings
      const currentRetention = await HybridMessagingService.getMessageRetentionHours();
      setRetentionHours(currentRetention);
      
      // Load statistics
      const stats = await HybridMessagingService.getMessageStatistics();
      setStatistics(stats);
      
    } catch (error) {
      console.error('Failed to load operator data:', error);
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRetention = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isOperator) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const success = await HybridMessagingService.updateMessageRetentionHours(retentionHours, user.id);
      
      if (success) {
        setSuccess(`Message retention updated to ${retentionHours} hours`);
        // Reload statistics
        await loadData();
      } else {
        setError('Failed to update retention settings');
      }
    } catch (error) {
      console.error('Error updating retention:', error);
      setError('Failed to update retention settings');
    } finally {
      setSaving(false);
    }
  };

  const handleCleanupMessages = async () => {
    if (!user || !isOperator) return;

    setCleaning(true);
    setError('');
    setSuccess('');

    try {
      const deletedCount = await HybridMessagingService.cleanupExpiredMessages();
      setSuccess(`Cleaned up ${deletedCount} expired messages`);
      
      // Reload statistics
      await loadData();
    } catch (error) {
      console.error('Error cleaning up messages:', error);
      setError('Failed to cleanup messages');
    } finally {
      setCleaning(false);
    }
  };

  if (!isOperator) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Settings className="w-16 h-16 text-zinc-400 mx-auto mb-4" />
          <p className="text-zinc-500 dark:text-zinc-400">
            Operator privileges required to access these settings
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-zinc-500 dark:text-zinc-400">Loading operator settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <Settings className="w-8 h-8 text-red-600" />
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
            Operator Settings
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Configure message retention and manage system settings
          </p>
        </div>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-green-700 dark:text-green-300">{success}</p>
        </div>
      )}
      
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Message Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-zinc-800 p-6 rounded-lg border border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center space-x-3">
            <Database className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Total Messages</p>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white">
                {statistics.totalMessages.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-800 p-6 rounded-lg border border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center space-x-3">
            <BarChart3 className="w-8 h-8 text-green-600" />
            <div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Last 24 Hours</p>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white">
                {statistics.messagesLast24h.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-800 p-6 rounded-lg border border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center space-x-3">
            <Clock className="w-8 h-8 text-amber-600" />
            <div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Retention</p>
              <p className="text-2xl font-bold text-zinc-900 dark:text-white">
                {statistics.averageRetentionHours}h
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-800 p-6 rounded-lg border border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center space-x-3">
            <Trash2 className="w-8 h-8 text-red-600" />
            <div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Next Cleanup</p>
              <p className="text-sm font-medium text-zinc-900 dark:text-white">
                {new Date(statistics.nextCleanupTime).toLocaleTimeString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Message Retention Settings */}
      <div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-6">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-4 flex items-center space-x-2">
          <Clock className="w-5 h-5" />
          <span>Message Retention</span>
        </h2>
        
        <form onSubmit={handleUpdateRetention} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Default Message Retention (Hours)
            </label>
            <div className="flex items-center space-x-4">
              <input
                type="number"
                min="1"
                max="8760"
                value={retentionHours}
                onChange={(e) => setRetentionHours(parseInt(e.target.value) || 24)}
                className="w-32 px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                disabled={saving}
              />
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                hours ({Math.round(retentionHours / 24 * 10) / 10} days)
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Messages will be automatically deleted after this duration
            </p>
          </div>
          
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center space-x-2"
          >
            {saving ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
            ) : (
              <Settings className="w-4 h-4" />
            )}
            <span>{saving ? 'Saving...' : 'Update Retention'}</span>
          </button>
        </form>
      </div>

      {/* Manual Cleanup */}
      <div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-6">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-4 flex items-center space-x-2">
          <Trash2 className="w-5 h-5" />
          <span>Manual Cleanup</span>
        </h2>
        
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          Manually clean up expired messages. This will remove all messages that have passed their retention time.
        </p>
        
        <button
          onClick={handleCleanupMessages}
          disabled={cleaning}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center space-x-2"
        >
          {cleaning ? (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
          <span>{cleaning ? 'Cleaning...' : 'Cleanup Expired Messages'}</span>
        </button>
      </div>

      {/* Information */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 p-6">
        <h3 className="text-lg font-medium text-blue-900 dark:text-blue-100 mb-2">
          How the Hybrid System Works
        </h3>
        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
          <li>• Messages are delivered instantly via real-time channels</li>
          <li>• Messages are also stored in the database for persistence</li>
          <li>• Users can see message history when they join/refresh</li>
          <li>• Messages are automatically deleted after the retention period</li>
          <li>• Operators can manually trigger cleanup anytime</li>
        </ul>
      </div>
    </div>
  );
};

export default OperatorSettings;