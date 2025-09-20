import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Users, Key } from 'lucide-react';
import { GroupService } from '../services/groupService';
import type { GroupWithDetails, CreateGroupData, JoinGroupData } from '../types';

type GroupView = 'list' | 'create' | 'join';

interface GroupManagerProps {
  onGroupSelect?: (group: GroupWithDetails) => void;
}

const GroupManager: React.FC<GroupManagerProps> = ({ onGroupSelect }) => {
  const [currentView, setCurrentView] = useState<GroupView>('list');
  const [groups, setGroups] = useState<GroupWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const { user, canCreateGroups } = useAuth();

  // Create group form state
  const [createData, setCreateData] = useState<CreateGroupData>({
    name: '',
    description: '',
    message_deletion_timer: 3600,
    max_members: 100,
  });

  // Join group form state
  const [joinData, setJoinData] = useState<JoinGroupData>({ access_code: '' });

  useEffect(() => {
    if (user) {
      loadUserGroups();
    }
  }, [user]);

  const loadUserGroups = async () => {
    if (!user) return;
    
    setLoading(true);
    const result = await GroupService.getUserGroups(user.id);
    
    if (result.success) {
      setGroups(result.data || []);
    } else {
      setError(result.error || 'Failed to load groups');
    }
    
    setLoading(false);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError('');
    setSuccess('');

    const result = await GroupService.createGroup(createData, user.id);
    
    if (result.success) {
      setSuccess(result.message || 'Group created successfully!');
      setCreateData({ name: '', description: '', message_deletion_timer: 3600, max_members: 100 });
      await loadUserGroups();
      setCurrentView('list');
    } else {
      setError(result.error || 'Failed to create group');
    }
    
    setLoading(false);
  };

  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError('');
    setSuccess('');

    const result = await GroupService.joinGroup(joinData, user.id);
    
    if (result.success) {
      setSuccess(result.message || 'Joined group successfully!');
      setJoinData({ access_code: '' });
      await loadUserGroups();
      setCurrentView('list');
    } else {
      setError(result.error || 'Failed to join group');
    }
    
    setLoading(false);
  };

  if (!canCreateGroups()) {
    return (
      <div className="p-6 text-center">
        <Users className="w-12 h-12 text-zinc-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-2">
          Groups Not Available
        </h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Guest users cannot access groups. Please create an account to join or create groups.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-700">
        <div className="flex items-center space-x-3">
          {currentView !== 'list' && (
            <button
              onClick={() => {
                setCurrentView('list');
                setError('');
                setSuccess('');
              }}
              className="p-2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              ←
            </button>
          )}
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            {currentView === 'list' && 'My Groups'}
            {currentView === 'create' && 'Create Group'}
            {currentView === 'join' && 'Join Group'}
          </h2>
        </div>
        
        {currentView === 'list' && (
          <div className="flex space-x-2">
            <button
              onClick={() => setCurrentView('join')}
              className="p-2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              title="Join Group"
            >
              <Key className="w-5 h-5" />
            </button>
            <button
              onClick={() => setCurrentView('create')}
              className="p-2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              title="Create Group"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {success && (
        <div className="mx-4 mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-sm text-green-700 dark:text-green-300">{success}</p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {currentView === 'list' && (
          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-500 border-t-transparent mx-auto"></div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">Loading groups...</p>
              </div>
            ) : groups.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-zinc-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-2">
                  No Groups Yet
                </h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                  Create your first group or join an existing one.
                </p>
                <div className="flex justify-center space-x-3">
                  <button
                    onClick={() => setCurrentView('create')}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Create Group
                  </button>
                  <button
                    onClick={() => setCurrentView('join')}
                    className="px-4 py-2 border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                  >
                    Join Group
                  </button>
                </div>
              </div>
            ) : (
              groups.map((group) => (
                <div
                  key={group.id}
                  className="p-4 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => onGroupSelect?.(group)}
                >
                  <h3 className="font-medium text-zinc-900 dark:text-white">
                    {group.name}
                  </h3>
                  {group.description && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                      {group.description}
                    </p>
                  )}
                  <div className="flex items-center space-x-4 mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>{group.member_count} members</span>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      group.user_role === 'admin' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400' :
                      group.user_role === 'moderator' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400' :
                      'bg-zinc-100 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-300'
                    }`}>
                      {group.user_role}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {currentView === 'create' && (
          <form onSubmit={handleCreateGroup} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Group Name *
              </label>
              <input
                type="text"
                required
                value={createData.name}
                onChange={(e) => setCreateData({ ...createData, name: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Enter group name"
                maxLength={100}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Description (Optional)
              </label>
              <textarea
                value={createData.description}
                onChange={(e) => setCreateData({ ...createData, description: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                placeholder="Describe your group"
                rows={3}
                maxLength={500}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
            >
              {loading ? 'Creating...' : 'Create Group'}
            </button>
          </form>
        )}

        {currentView === 'join' && (
          <form onSubmit={handleJoinGroup} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Access Code *
              </label>
              <input
                type="text"
                required
                value={joinData.access_code}
                onChange={(e) => setJoinData({ access_code: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-center text-lg tracking-wider"
                placeholder="ENTER CODE"
                maxLength={20}
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Enter the 8-character access code provided by the group admin.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
            >
              {loading ? 'Joining...' : 'Join Group'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default GroupManager;