import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Send, Clock, Users } from 'lucide-react';
import { HybridMessagingService } from '../services/hybridMessaging';
import { formatDistanceToNow } from 'date-fns';
import type { RealtimeMessage, ChatContext, GroupWithDetails } from '../types';

interface RealtimeChatProps {
  context: ChatContext;
  group?: GroupWithDetails | null;
  onBack?: () => void;
  className?: string;
}

const RealtimeChat: React.FC<RealtimeChatProps> = ({ context, group, onBack, className = '' }) => {
  const [messages, setMessages] = useState<RealtimeMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { user } = useAuth();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!user) return;

    let mounted = true;
    
    const initializeChat = async () => {
      try {
        // Load message history from database
        const history = await HybridMessagingService.loadMessageHistory(context, group?.id);
        if (mounted) {
          setMessages(history);
          setLoading(false);
        }
        
        // Subscribe to hybrid real-time updates
        await HybridMessagingService.subscribe(
          context,
          group?.id || null,
          handleNewMessage,
          handleUserJoin,
          handleUserLeave
        );

        // Update presence
        await HybridMessagingService.updatePresence(context, group?.id || null, user);

        // Get current online users
        const users = HybridMessagingService.getOnlineUsers(context, group?.id || null);
        if (mounted) {
          setOnlineUsers(users);
        }
      } catch (error) {
        console.error('Failed to initialize chat:', error);
        if (mounted) {
          setError('Failed to connect to chat');
          setLoading(false);
        }
      }
    };

    initializeChat();

    return () => {
      mounted = false;
      // Clean up subscription
      const channelName = context === 'direct' ? 'direct_chat' : `group_${group?.id}`;
      HybridMessagingService.unsubscribe(channelName);
    };
  }, [user, context, group?.id]);

  const handleNewMessage = (message: RealtimeMessage) => {
    setMessages(prev => {
      // Check if message already exists
      const exists = prev.some(m => m.id === message.id);
      if (exists) return prev;
      
      // Add new message and sort by creation time
      const updated = [...prev, message].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      
      return updated;
    });
  };

  const handleUserJoin = (joinedUser: any) => {
    setOnlineUsers(prev => {
      const exists = prev.some(u => u.id === joinedUser.id);
      if (exists) return prev;
      return [...prev, joinedUser];
    });
  };

  const handleUserLeave = (leftUser: any) => {
    setOnlineUsers(prev => prev.filter(u => u.id !== leftUser.id));
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !newMessage.trim()) return;

    setSending(true);
    setError('');
    const content = newMessage.trim();
    setNewMessage('');

    try {
      // Send message with hybrid approach (database + real-time)
      await HybridMessagingService.sendMessage(
        content,
        context,
        group?.id || null,
        user
      );
    } catch (error: any) {
      console.error('Error sending message:', error);
      setError('Failed to send message. Please try again.');
      setNewMessage(content); // Restore message on failure
    } finally {
      setSending(false);
    }
  };

  const getTimeRemaining = (expiresAt: string): string => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    
    if (diff <= 0) return 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours === 0) return `${minutes}m left`;
    return `${hours}h ${minutes}m left`;
  };

  const getRoleColor = (role: string): string => {
    switch (role) {
      case 'operator': return 'text-red-600 dark:text-red-400';
      case 'admin': return 'text-amber-600 dark:text-amber-400';
      case 'normal': return 'text-blue-600 dark:text-blue-400';
      case 'guest': return 'text-zinc-500 dark:text-zinc-400';
      default: return 'text-zinc-700 dark:text-zinc-300';
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-zinc-500 dark:text-zinc-400">Please log in to access chat</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Chat Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
        <div className="flex items-center space-x-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
              title="Back to Groups"
            >
              ←
            </button>
          )}
          <div>
            <h3 className="font-medium text-zinc-900 dark:text-white">
              {context === 'direct' ? 'Direct Chat' : group?.name || 'Group Chat'}
            </h3>
            {context === 'group' && group && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {group.description || `${group.member_count} members`}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-4 text-sm text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center space-x-1">
            <Users className="w-4 h-4" />
            <span>{onlineUsers.length} online</span>
          </div>
          {context === 'group' && group && (
            <div className="flex items-center space-x-1">
              <Clock className="w-4 h-4" />
              <span>
                {Math.floor(group.message_deletion_timer / 3600)}h timer
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50 dark:bg-zinc-900">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent mx-auto mb-4"></div>
            <p className="text-zinc-500 dark:text-zinc-400">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-zinc-500 dark:text-zinc-400">
              {context === 'direct' 
                ? 'Messages are stored in database and auto-deleted based on Operator settings.' 
                : 'Messages are stored and auto-deleted according to group settings.'}
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.user_id === user.id ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${
                  message.user_id === user.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-700'
                }`}
              >
                {/* Message Header */}
                {message.user_id !== user.id && (
                  <div className="flex items-center space-x-2 mb-1">
                    <span className={`text-sm font-medium ${getRoleColor(message.user_role)}`}>
                      {message.display_name || message.username}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full text-xs ${
                      message.user_role === 'operator' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                      message.user_role === 'admin' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400' :
                      message.user_role === 'normal' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400' :
                      'bg-zinc-100 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-300'
                    }`}>
                      {message.user_role}
                    </span>
                  </div>
                )}
                
                {/* Message Content */}
                <p className="text-sm whitespace-pre-wrap break-words">
                  {message.content}
                </p>
                
                {/* Message Footer */}
                <div className={`flex items-center justify-between mt-2 text-xs ${
                  message.user_id === user.id
                    ? 'text-indigo-200'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}>
                  <span>
                    {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                  </span>
                  <span className="flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{getTimeRemaining(message.expires_at)}</span>
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-4 mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Message Input */}
      <form onSubmit={handleSendMessage} className="p-4 border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
        <div className="flex space-x-3">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={`Message ${context === 'direct' ? 'direct chat' : group?.name || 'group'}...`}
            className="flex-1 px-4 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
            maxLength={1000}
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending || !newMessage.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center space-x-2"
          >
            {sending ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">
              {sending ? 'Sending...' : 'Send'}
            </span>
          </button>
        </div>
        
        {/* Message Info */}
        <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {context === 'direct' && (
            <p>Messages stored in database • Auto-deleted by Operator settings • Real-time delivery</p>
          )}
          {context === 'group' && group && (
            <p>
              Messages stored in database • Auto-deleted after {Math.floor(group.message_deletion_timer / 3600)}h 
              {Math.floor((group.message_deletion_timer % 3600) / 60) > 0 && 
                ` ${Math.floor((group.message_deletion_timer % 3600) / 60)}m`
              } • Real-time delivery
            </p>
          )}
        </div>
      </form>
    </div>
  );
};

export default RealtimeChat;