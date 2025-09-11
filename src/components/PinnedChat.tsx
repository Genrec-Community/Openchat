import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { PinnedMessage } from '../types';
import { Pin, Edit2, Trash2, Crown, AlertCircle, Megaphone, Check, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const PinnedChat: React.FC = () => {
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const { user, isOP } = useAuth();

  useEffect(() => {
    fetchPinnedMessages();
    
    // Set up real-time subscription
    const channel = supabase
      .channel('pinned_messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pinned_messages',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setPinnedMessages(prev => [...prev, payload.new as PinnedMessage]);
          } else if (payload.eventType === 'DELETE') {
            setPinnedMessages(prev => prev.filter(msg => msg.id !== payload.old.id));
          } else if (payload.eventType === 'UPDATE') {
            setPinnedMessages(prev => 
              prev.map(msg => msg.id === payload.new.id ? payload.new as PinnedMessage : msg)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchPinnedMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('pinned_messages')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPinnedMessages(data || []);
    } catch (error) {
      console.error('Error fetching pinned messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const addPinnedMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessage.trim() || !user || !isOP || sending) return;

    setSending(true);
    const content = newMessage.trim();
    const tempId = `temp-${Date.now()}`;

    const optimisticMessage: PinnedMessage = {
      id: tempId,
      user_id: user.id,
      username: user.username,
      content,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setPinnedMessages(prev => [optimisticMessage, ...prev]);
    setNewMessage('');

    try {
      const { data, error } = await supabase
        .from('pinned_messages')
        .insert([
          {
            user_id: user.id,
            username: user.username,
            content: content,
          },
        ])
        .select();

      if (error) throw error;

      setPinnedMessages(prev => prev.map(m => m.id === tempId ? data[0] : m));

    } catch (error) {
      console.error('Error adding pinned message:', error);
      alert('Failed to add pinned message. Please try again.');
      setPinnedMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setSending(false);
    }
  };

  const startEditing = (message: PinnedMessage) => {
    setEditingId(message.id);
    setEditingContent(message.content);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingContent('');
  };

  const saveEdit = async (messageId: string) => {
    if (!editingContent.trim()) return;

    const originalContent = pinnedMessages.find(m => m.id === messageId)?.content;
    setPinnedMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: editingContent.trim(), updated_at: new Date().toISOString() } : m));
    setEditingId(null);
    setEditingContent('');

    try {
      const { error } = await supabase
        .from('pinned_messages')
        .update({
          content: editingContent.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', messageId);

      if (error) throw error;
      
    } catch (error) {
      console.error('Error updating pinned message:', error);
      alert('Failed to update message. Please try again.');
      setPinnedMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: originalContent || m.content, updated_at: m.created_at } : m));
    }
  };

  const deletePinnedMessage = async (messageId: string) => {
    if (!confirm('Are you sure you want to permanently delete this pinned message?\n\nThis action cannot be undone, and the message will be removed forever.')) return;

    const originalMessages = [...pinnedMessages];
    setPinnedMessages(prev => prev.filter(m => m.id !== messageId));

    try {
      const { error } = await supabase
        .from('pinned_messages')
        .delete()
        .eq('id', messageId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting pinned message:', error);
      alert('Failed to delete message. Please try again.');
      setPinnedMessages(originalMessages);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-8 h-8 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin"></div>
          <p className="text-slate-600 dark:text-slate-400 font-medium">Loading pinned messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900">
      {/* Enhanced Header */}
      <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border-b border-amber-200 dark:border-amber-800 p-6">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Megaphone className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-amber-900 dark:text-amber-100">Pinned Messages</h2>
            <p className="text-amber-700 dark:text-amber-300">
              Permanent announcements from moderators - never auto-deleted
            </p>
          </div>
        </div>
      </div>

      {/* Enhanced Pinned Messages */}
      <div className="flex-1 overflow-y-auto p-6">
        {pinnedMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-gradient-to-br from-amber-100 to-yellow-100 dark:from-amber-900/30 dark:to-yellow-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <Pin className="w-10 h-10 text-amber-500" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">No pinned messages yet</h3>
              <p className="text-slate-600 dark:text-slate-400 mb-4">Permanent announcements will appear here</p>
              {isOP && (
                <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                  📌 Add your first permanent announcement below
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {pinnedMessages.map((message) => (
              <div
                key={message.id}
                className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow duration-200"
              >
                <div className="flex items-start gap-4">
                  {/* OP Avatar */}
                  <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-md">
                    <Crown className="w-5 h-5 text-white" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    {/* Message Header */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-amber-900 dark:text-amber-100">
                          {message.username}
                        </span>
                        <div className="flex items-center gap-1 px-2 py-1 bg-amber-200 dark:bg-amber-800 rounded-full">
                          <Crown className="w-3 h-3 text-amber-700 dark:text-amber-300" />
                          <span className="text-xs font-medium text-amber-800 dark:text-amber-200">OP</span>
                        </div>
                      </div>
                      <div className="text-xs text-amber-600 dark:text-amber-400">
                        {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                        {message.updated_at !== message.created_at && (
                          <span className="ml-1 italic">
                            (edited {formatDistanceToNow(new Date(message.updated_at), { addSuffix: true })})
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Message Content */}
                    {editingId === message.id ? (
                      <div className="space-y-4">
                        <textarea
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                          className="w-full min-h-[120px] px-4 py-3 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all duration-200 resize-y"
                          placeholder="Enter your permanent announcement..."
                        />
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-amber-600 dark:text-amber-400">
                            💾 This announcement will be permanent until manually deleted by OP
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveEdit(message.id)}
                              className="inline-flex items-center px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors duration-200"
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Save
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="inline-flex items-center px-3 py-2 bg-slate-300 hover:bg-slate-400 dark:bg-slate-600 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-lg transition-colors duration-200"
                            >
                              <X className="w-4 h-4 mr-1" />
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white/50 dark:bg-slate-800/50 rounded-xl p-4 border border-amber-200/50 dark:border-amber-700/50">
                        <p className="text-slate-900 dark:text-slate-100 leading-relaxed whitespace-pre-wrap">
                          {message.content}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  {/* Action Buttons */}
                  {isOP && editingId !== message.id && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEditing(message)}
                        className="p-2 text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-lg transition-all duration-200"
                        title="Edit message"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deletePinnedMessage(message.id)}
                        className="p-2 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-all duration-200"
                        title="Delete message"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Enhanced Add New Pinned Message (OP Only) */}
      {isOP ? (
        <div className="border-t border-amber-200 dark:border-amber-800 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 p-6">
          <form onSubmit={addPinnedMessage} className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-full flex items-center justify-center">
                <Pin className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-100">Add Permanent Announcement</h3>
            </div>
            
            <div className="mb-3 p-3 bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
                <Pin className="w-4 h-4" />
                <span className="font-medium">Important:</span>
                <span>Pinned messages are permanent and will never be automatically deleted. Only OP can remove them.</span>
              </div>
            </div>
            
            <div className="relative">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Share a permanent announcement with all users...\n\nThis message will remain visible until manually deleted by a moderator."
                className="w-full min-h-[120px] px-4 py-4 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-y transition-all duration-200 shadow-sm"
                disabled={sending}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
                <Pin className="w-4 h-4" />
                <span>📌 Permanent announcement - no character limit</span>
              </div>
              <button
                type="submit"
                disabled={!newMessage.trim() || sending}
                className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
              >
                {sending ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                    Pinning...
                  </>
                ) : (
                  <>
                    <Pin className="w-5 h-5 mr-2" />
                    Pin Message
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-6">
          <div className="flex items-center justify-center text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-3 p-4 bg-white/50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-600">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              <span className="font-medium">Only moderators can add pinned messages</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PinnedChat;