import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { RealtimeMessage } from '../types';
import { Send, Crown, Clock, Timer, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { messageCleanupService } from '../services/messageCleanup';

// Countdown Timer Component
interface CountdownTimerProps {
  expiresAt: string;
  isOwn: boolean;
  className?: string;
}

const CountdownTimer: React.FC<CountdownTimerProps> = ({ expiresAt, isOwn, className = '' }) => {
  const [timeRemaining, setTimeRemaining] = useState('');
  const [isExpired, setIsExpired] = useState(false);
  const [urgency, setUrgency] = useState<'normal' | 'warning' | 'critical'>('normal');

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date().getTime();
      const expires = new Date(expiresAt).getTime();
      const diff = expires - now;

      if (diff <= 0) {
        setTimeRemaining('Expired');
        setIsExpired(true);
        setUrgency('critical');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      // Determine urgency level
      if (diff <= 5 * 60 * 1000) { // Less than 5 minutes
        setUrgency('critical');
      } else if (diff <= 30 * 60 * 1000) { // Less than 30 minutes
        setUrgency('warning');
      } else {
        setUrgency('normal');
      }

      if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m`);
      } else if (minutes > 0) {
        setTimeRemaining(`${minutes}m ${seconds}s`);
      } else {
        setTimeRemaining(`${seconds}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  const getUrgencyStyles = () => {
    if (isExpired) {
      return isOwn 
        ? 'bg-red-500/20 text-red-200 border border-red-400/30'
        : 'bg-red-100 text-red-800 border border-red-300 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700';
    }

    switch (urgency) {
      case 'critical':
        return isOwn 
          ? 'bg-red-500/20 text-red-200 border border-red-400/30 animate-pulse'
          : 'bg-red-100 text-red-800 border border-red-300 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700 animate-pulse';
      case 'warning':
        return isOwn 
          ? 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
          : 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700';
      default:
        return isOwn 
          ? 'bg-green-500/20 text-green-200 border border-green-400/30'
          : 'bg-green-100 text-green-800 border border-green-300 dark:bg-green-900/20 dark:text-green-400 dark:border-green-700';
    }
  };

  return (
    <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-medium ${getUrgencyStyles()} ${className}`}>
      <Timer className="w-3 h-3" />
      <span>{timeRemaining}</span>
    </span>
  );
};

const DirectChat: React.FC = () => {
  const [messages, setMessages] = useState<RealtimeMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [newMessageIndicator, setNewMessageIndicator] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user, isOperator } = useAuth();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    fetchMessages();
    
    // Use a shared channel name so all tabs/browsers subscribe to the same channel
    const sharedChannelName = 'openchat_messages_realtime';
    let channel: any = null;
    let retryCount = 0;
    const maxRetries = 3;
    
    const setupRealtimeSubscription = () => {
      console.log(`🚀 Setting up real-time subscription on channel: ${sharedChannelName} (attempt ${retryCount + 1})`);
      
      // Clean up any existing channel
      if (channel) {
        supabase.removeChannel(channel);
      }
      
      channel = supabase
        .channel(sharedChannelName, {
          config: {
            presence: {
              key: `user-${Date.now()}`,
            },
            broadcast: {
              self: true, // Allow self-broadcast for immediate message display
            },
          },
        })
        .on(
          'postgres_changes',
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages_v2',
            filter: 'message_type=eq.direct'
          },
          (payload) => {
            const receiveTime = Date.now();
            console.log('✅ New message received via real-time:', payload.new);
            const newMessage = payload.new as RealtimeMessage;
            
            // Calculate delivery latency for performance monitoring
            const messageTime = new Date(newMessage.created_at).getTime();
            const latency = receiveTime - messageTime;
            if (latency > 2000) {
              console.warn(`⚠️ High latency detected: ${latency}ms`);
            } else {
              console.log(`⚡ Message delivered in ${latency}ms`);
            }
            
            setMessages(prev => {
              // Check if message already exists to avoid duplicates
              const exists = prev.some(msg => msg.id === newMessage.id);
              
              if (!exists) {
                console.log('✅ Adding new message to state:', newMessage.id);
                setNewMessageIndicator(newMessage.id); // Mark as new
                setTimeout(() => setNewMessageIndicator(null), 3000); // Clear indicator after 3s
                return [...prev, newMessage];
              } else {
                console.log('✅ Message already exists, replacing if needed:', newMessage.id);
                // Replace any temporary message or update existing
                return prev.map(msg => {
                  // Replace temp messages from same user with same content
                  if (msg.id.startsWith('temp-') && 
                      msg.content === newMessage.content && 
                      msg.user_id === newMessage.user_id) {
                    return newMessage;
                  }
                  // Update existing message if IDs match
                  if (msg.id === newMessage.id) {
                    return newMessage;
                  }
                  return msg;
                });
              }
            });
          }
        )
        .on(
          'postgres_changes',
          { 
            event: 'DELETE', 
            schema: 'public', 
            table: 'messages_v2'
          },
          (payload) => {
            console.log('✅ Message deleted via real-time:', payload.old);
            const deletedMessage = payload.old as RealtimeMessage;
            setMessages(prev => prev.filter(msg => msg.id !== deletedMessage.id));
          }
        )
        .subscribe((status, err) => {
          console.log('📡 Real-time subscription status:', status);
          if (err) {
            console.error('❌ Real-time subscription error:', err);
          }
          
          if (status === 'SUBSCRIBED') {
            console.log('🎉 Successfully subscribed to real-time updates!');
            retryCount = 0; // Reset retry count on successful connection
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ Error with real-time subscription');
            if (retryCount < maxRetries) {
              retryCount++;
              console.log(`🔄 Retrying connection in 1 second (${retryCount}/${maxRetries})...`);
              setTimeout(setupRealtimeSubscription, 1000); // Faster retry for high-load scenarios
            } else {
              console.error('❌ Max retries reached. Real-time disabled, using periodic sync only.');
            }
          } else if (status === 'TIMED_OUT') {
            console.error('❌ Real-time subscription timed out');
            if (retryCount < maxRetries) {
              retryCount++;
              console.log(`🔄 Retrying connection in 2 seconds (${retryCount}/${maxRetries})...`);
              setTimeout(setupRealtimeSubscription, 2000); // Slightly longer for timeout scenarios
            }
          } else if (status === 'CLOSED') {
            console.log('📡 Real-time subscription closed');
          }
        });
    };
    
    // Initial setup
    setupRealtimeSubscription();

    // Set up periodic cleanup of expired messages from UI
    const cleanupInterval = setInterval(() => {
      setMessages(prev => prev.filter(message => {
        return !messageCleanupService.isMessageExpired(message.expires_at);
      }));
    }, 60000); // Check every minute
    
    // Set up periodic message sync to ensure consistency across tabs
    // This helps catch any messages that might have been missed by real-time
    const syncInterval = setInterval(async () => {
      try {
        console.log('🔄 Performing periodic message sync...');
        const { data, error } = await supabase
          .from('messages_v2')
          .select('*')
          .eq('message_type', 'direct')
          .order('created_at', { ascending: true });
        
        if (error) {
          console.error('❌ Error during periodic sync:', error);
          return;
        }
        
        const validMessages = (data || []).filter(message => {
          return !messageCleanupService.isMessageExpired(message.expires_at);
        });
        
        setMessages(prev => {
          // Only update if there are new messages
          const newMessages = validMessages.filter(dbMsg => 
            !prev.some(localMsg => localMsg.id === dbMsg.id)
          );
          
          if (newMessages.length > 0) {
            console.log(`🎆 Found ${newMessages.length} new messages during sync`);
            return validMessages; // Replace with complete list from database
          }
          
          return prev; // No changes needed
        });
      } catch (error) {
        console.error('❌ Error during periodic message sync:', error);
      }
    }, 5000); // Reduced to 5 seconds for high-load backup performance

    return () => {
      console.log('🧹 Cleaning up real-time subscription and intervals');
      if (channel) {
        supabase.removeChannel(channel);
      }
      clearInterval(cleanupInterval);
      clearInterval(syncInterval);
    };
  }, []);

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('messages_v2')
        .select('*')
        .eq('message_type', 'direct')
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      // Filter out expired messages and update state
      const validMessages = (data || []).filter(message => {
        return !messageCleanupService.isMessageExpired(message.expires_at);
      });
      
      setMessages(validMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || sending) return;

    setSending(true);
    const content = newMessage.trim();
    const tempId = `temp-${Date.now()}-${Math.random()}`; // More unique temp ID
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Create optimistic message for immediate UI feedback
    const optimisticMessage: RealtimeMessage = {
      id: tempId,
      user_id: user.id,
      username: user.username,
      display_name: user.display_name,
      content,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
      message_type: 'direct',
      user_role: user.role,
    };

    // Add optimistic message immediately for the sender
    setMessages(prev => [...prev, optimisticMessage]);
    setNewMessage('');

    try {
      console.log('Sending message using new TTL infrastructure:', content);
      
      // Use the new guest-compatible function
      const { data: messageId, error } = await supabase.rpc('send_message_v2_guest', {
        p_user_id: user.id,
        p_content: content,
        p_message_type: 'direct',
        p_group_id: null,
        p_custom_retention_hours: null
      });

      if (error) throw error;

      console.log('Message sent successfully with TTL, database ID:', messageId);
      
      // Fetch the complete message from database (with all metadata including calculated TTL)
      const { data: storedMessage, error: fetchError } = await supabase
        .from('messages_v2')
        .select('*')
        .eq('id', messageId)
        .single();

      if (fetchError) {
        console.error('Failed to fetch stored message:', fetchError);
        throw fetchError;
      }

      // Replace the optimistic message with the real one from database
      // This ensures the sender's tab shows the correct message with proper TTL
      if (storedMessage) {
        setMessages(prev => prev.map(m => {
          if (m.id === tempId) {
            console.log('Replacing optimistic message with real TTL message:', storedMessage.id);
            return storedMessage;
          }
          return m;
        }));
      }
      
      // Note: Other tabs will receive this message via real-time subscription
      
      // Re-focus the input field after successful send
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);

    } catch (error) {
      console.error('Error sending message:', error);
      setNewMessage(content); // Re-populate the input if sending fails
      setMessages(prev => prev.filter(m => m.id !== tempId)); // Remove optimistic message on failure
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-100 dark:bg-zinc-900">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-100 dark:bg-zinc-900">
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {messages.map((message) => {
          const isOwn = message.user_id === user?.id;
          const timeRemaining = messageCleanupService.getTimeRemaining(message.expires_at);
          const isExpiringSoon = !timeRemaining.expired && timeRemaining.hours === 0 && timeRemaining.minutes < 30;
          const displayName = message.display_name || message.username;
          const isNewMessage = newMessageIndicator === message.id;
          
          return (
            <div key={message.id} className={`flex items-start gap-3 ${isOwn ? 'flex-row-reverse' : ''} ${isNewMessage ? 'animate-pulse bg-blue-50 dark:bg-blue-900/10 rounded-lg p-2 -m-2' : ''}`}>
              {/* User Avatar */}
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0 ${isOwn ? 'bg-indigo-500' : 'bg-zinc-400'}`}>
                {displayName.charAt(0).toUpperCase()}
              </div>
              
              {/* Message Bubble */}
              <div className={`max-w-lg ${isOwn ? 'items-end' : 'items-start'} flex flex-col space-y-1`}>
                {/* User Name and Role */}
                <div className={`flex items-center space-x-2 ${isOwn ? 'flex-row-reverse space-x-reverse' : ''}`}>
                  <div className="flex items-center space-x-1">
                    <span className={`text-xs font-semibold ${isOwn ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                      {displayName}
                    </span>
                    {message.display_name && (
                      <span className={`text-xs text-zinc-500 dark:text-zinc-400`}>
                        (@{message.username})
                      </span>
                    )}
                  </div>
                  
                  {/* Role Badge */}
                  <div className="flex items-center space-x-1">
                    {message.user_role === 'operator' && (
                      <Crown className="w-3.5 h-3.5 text-amber-500" />
                    )}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                      message.user_role === 'operator' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                      message.user_role === 'admin' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400' :
                      message.user_role === 'normal' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400' :
                      'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400'
                    }`}>
                      {message.user_role}
                    </span>
                  </div>
                </div>
                
                {/* New Message Indicator */}
                {isNewMessage && !isOwn && (
                  <div className="absolute -top-1 -left-1 w-3 h-3 bg-blue-500 rounded-full animate-ping" />
                )}
                
                {/* Message Content */}
                <div className={`p-3.5 rounded-2xl shadow-sm ${isOwn ? 'bg-indigo-500 text-white rounded-br-none' : 'bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-bl-none border border-zinc-200 dark:border-zinc-600'} ${timeRemaining.expired ? 'opacity-50' : ''}`}>
                  <p className="text-sm break-words leading-relaxed">{message.content}</p>
                  
                  {/* Message Footer */}
                  <div className={`flex items-center justify-between mt-2 text-xs ${isOwn ? 'text-indigo-100' : 'text-zinc-400 dark:text-zinc-500'}`}>
                    <div className="flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>{formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}</span>
                    </div>
                    
                    {/* Real-time Countdown Timer */}
                    <CountdownTimer 
                      expiresAt={message.expires_at} 
                      isOwn={isOwn}
                      className="ml-2"
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <div className="bg-white dark:bg-zinc-800 p-4 border-t border-zinc-200 dark:border-zinc-700">
        <form onSubmit={sendMessage} className="flex items-center space-x-3">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="w-full px-5 py-3 bg-zinc-100 dark:bg-zinc-700 border-transparent rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
              disabled={sending}
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="p-3 bg-indigo-500 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-zinc-800 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
          >
            {sending ? (
              <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
            ) : (
              <Send size={20} />
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default DirectChat;