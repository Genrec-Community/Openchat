import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Message } from '../types';
import { Send, Crown, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { messageCleanupService } from '../services/messageCleanup';

const DirectChat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user, isOP } = useAuth();

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
              self: false, // Don't broadcast to self
            },
          },
        })
        .on(
          'postgres_changes',
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages' 
          },
          (payload) => {
            const receiveTime = Date.now();
            console.log('✅ New message received via real-time:', payload.new);
            const newMessage = payload.new as Message;
            
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
            table: 'messages' 
          },
          (payload) => {
            console.log('✅ Message deleted via real-time:', payload.old);
            const deletedMessage = payload.old as Message;
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
          .from('messages')
          .select('*')
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
        .from('messages')
        .select('*')
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
    const optimisticMessage: Message = {
      id: tempId,
      user_id: user.id,
      username: user.username,
      content,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
    };

    // Add optimistic message immediately for the sender
    setMessages(prev => [...prev, optimisticMessage]);
    setNewMessage('');

    try {
      console.log('Sending message to database:', content);
      
      const { data, error } = await supabase
        .from('messages')
        .insert([{ 
          user_id: user.id, 
          username: user.username, 
          content,
          expires_at: expiresAt
        }])
        .select();

      if (error) throw error;

      console.log('Message sent successfully, database ID:', data[0]?.id);
      
      // Replace the optimistic message with the real one from database
      // This ensures the sender's tab shows the correct message immediately
      if (data && data[0]) {
        setMessages(prev => prev.map(m => {
          if (m.id === tempId) {
            console.log('Replacing optimistic message with real message:', data[0].id);
            return data[0];
          }
          return m;
        }));
      }
      
      // Note: Other tabs will receive this message via real-time subscription

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
          
          return (
            <div key={message.id} className={`flex items-end gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0 ${isOwn ? 'bg-indigo-500' : 'bg-zinc-400'}`}>
                {message.username.charAt(0).toUpperCase()}
              </div>
              <div className={`max-w-lg p-3.5 rounded-2xl shadow-sm ${isOwn ? 'bg-indigo-500 text-white rounded-br-none' : 'bg-white dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-bl-none'} ${timeRemaining.expired ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold">{message.username}</span>
                  {isOP && message.username === user?.username && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                </div>
                <p className="text-sm break-words">{message.content}</p>
                <div className={`text-xs mt-2 flex items-center gap-1.5 ${isOwn ? 'text-indigo-100' : 'text-zinc-400'}`}>
                  <Clock size={12} />
                  <span>{formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}</span>
                  {message.expires_at && (
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                      timeRemaining.expired 
                        ? 'bg-red-500 text-white'
                        : isExpiringSoon 
                        ? 'bg-yellow-500 text-black'
                        : 'bg-green-500 text-white'
                    }`}>
                      {messageCleanupService.formatTimeRemaining(message.expires_at)}
                    </span>
                  )}
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
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="w-full px-5 py-3 bg-zinc-100 dark:bg-zinc-700 border-transparent rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
              disabled={sending}
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