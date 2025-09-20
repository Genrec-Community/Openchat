import { supabase } from '../lib/supabase';
import type { RealtimeMessage, RealtimeChannel, ChatContext, GroupWithDetails } from '../types';

/**
 * Real-time Messaging Service
 * Handles pure real-time messaging without database storage
 */
export class RealtimeMessagingService {
  private static channels = new Map<string, any>();
  private static messageHandlers = new Map<string, (message: RealtimeMessage) => void>();
  private static messageTimers = new Map<string, any>();
  private static messages = new Map<string, RealtimeMessage[]>();

  /**
   * Subscribe to a chat channel
   */
  static async subscribe(
    context: ChatContext,
    groupId: string | null,
    onMessage: (message: RealtimeMessage) => void,
    onUserJoin?: (user: any) => void,
    onUserLeave?: (user: any) => void
  ): Promise<void> {
    const channelName = this.getChannelName(context, groupId);
    
    // Clean up existing subscription
    this.unsubscribe(channelName);
    
    console.log(`🔌 Subscribing to channel: ${channelName}`);
    
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false },
        presence: { key: `user-${Date.now()}` },
      },
    });

    // Handle real-time messages
    channel.on('broadcast', { event: 'message' }, (payload: any) => {
      const message = payload.payload as RealtimeMessage;
      console.log('📨 Received real-time message:', message);
      
      // Add to local message store
      this.addMessage(channelName, message);
      
      // Set up auto-deletion timer
      this.scheduleMessageDeletion(channelName, message);
      
      // Call handler
      onMessage(message);
    });

    // Handle user presence (join/leave)
    if (onUserJoin || onUserLeave) {
      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        console.log('👥 Presence state changed:', state);
        
        // Handle presence changes
        Object.keys(state).forEach(key => {
          const presence = state[key][0];
          if (presence) {
            onUserJoin?.(presence.user);
          }
        });
      });
      
      channel.on('presence', { event: 'join' }, ({ key, newPresences }: any) => {
        console.log('👋 User joined:', newPresences);
        newPresences.forEach((presence: any) => onUserJoin?.(presence.user));
      });
      
      channel.on('presence', { event: 'leave' }, ({ key, leftPresences }: any) => {
        console.log('👋 User left:', leftPresences);
        leftPresences.forEach((presence: any) => onUserLeave?.(presence.user));
      });
    }

    // Subscribe to the channel
    const status = await channel.subscribe();
    console.log(`📡 Channel subscription status: ${status}`);
    
    // Store channel and handler
    this.channels.set(channelName, channel);
    this.messageHandlers.set(channelName, onMessage);
  }

  /**
   * Send a message to a channel
   */
  static async sendMessage(
    content: string,
    context: ChatContext,
    groupId: string | null,
    user: any,
    deletionTimer: number = 3600 // Default 1 hour
  ): Promise<void> {
    const channelName = this.getChannelName(context, groupId);
    const channel = this.channels.get(channelName);
    
    if (!channel) {
      throw new Error('Not subscribed to channel');
    }

    const message: RealtimeMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      user_id: user.id,
      username: user.username,
      display_name: user.display_name,
      content,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + deletionTimer * 1000).toISOString(),
      group_id: groupId || undefined,
      message_type: context,
      user_role: user.role,
    };

    console.log('📤 Sending message:', message);

    // Broadcast the message
    const result = await channel.send({
      type: 'broadcast',
      event: 'message',
      payload: message,
    });

    if (result !== 'ok') {
      throw new Error('Failed to send message');
    }

    // Add to local store immediately for sender
    this.addMessage(channelName, message);
    
    // Set up auto-deletion timer
    this.scheduleMessageDeletion(channelName, message);
    
    // Call local handler for immediate display
    const handler = this.messageHandlers.get(channelName);
    if (handler) {
      handler(message);
    }
  }

  /**
   * Unsubscribe from a channel
   */
  static unsubscribe(channelName: string): void {
    const channel = this.channels.get(channelName);
    if (channel) {
      console.log(`🔌 Unsubscribing from channel: ${channelName}`);
      supabase.removeChannel(channel);
      this.channels.delete(channelName);
      this.messageHandlers.delete(channelName);
      
      // Clear message timers for this channel
      this.clearChannelTimers(channelName);
      
      // Clear messages for this channel
      this.messages.delete(channelName);
    }
  }

  /**
   * Get all messages for a channel
   */
  static getMessages(context: ChatContext, groupId: string | null): RealtimeMessage[] {
    const channelName = this.getChannelName(context, groupId);
    return this.messages.get(channelName) || [];
  }

  /**
   * Clear all messages for a channel
   */
  static clearMessages(context: ChatContext, groupId: string | null): void {
    const channelName = this.getChannelName(context, groupId);
    this.messages.delete(channelName);
    this.clearChannelTimers(channelName);
  }

  /**
   * Update user presence in a channel
   */
  static async updatePresence(
    context: ChatContext,
    groupId: string | null,
    user: any
  ): Promise<void> {
    const channelName = this.getChannelName(context, groupId);
    const channel = this.channels.get(channelName);
    
    if (channel) {
      await channel.track({
        user: {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
          role: user.role,
          online_at: new Date().toISOString(),
        },
      });
    }
  }

  /**
   * Leave a channel (remove presence)
   */
  static async leaveChannel(context: ChatContext, groupId: string | null): Promise<void> {
    const channelName = this.getChannelName(context, groupId);
    const channel = this.channels.get(channelName);
    
    if (channel) {
      await channel.untrack();
    }
  }

  /**
   * Get online users in a channel
   */
  static getOnlineUsers(context: ChatContext, groupId: string | null): any[] {
    const channelName = this.getChannelName(context, groupId);
    const channel = this.channels.get(channelName);
    
    if (!channel) return [];
    
    const state = channel.presenceState();
    const users: any[] = [];
    
    Object.keys(state).forEach(key => {
      const presences = state[key];
      if (presences && presences.length > 0) {
        users.push(presences[0].user);
      }
    });
    
    return users;
  }

  /**
   * Clean up all subscriptions
   */
  static cleanup(): void {
    console.log('🧹 Cleaning up all real-time subscriptions');
    
    // Unsubscribe from all channels
    this.channels.forEach((channel, channelName) => {
      this.unsubscribe(channelName);
    });
    
    // Clear all timers
    this.messageTimers.forEach(timer => clearTimeout(timer));
    this.messageTimers.clear();
    
    // Clear all messages
    this.messages.clear();
  }

  // Private helper methods

  private static getChannelName(context: ChatContext, groupId: string | null): string {
    if (context === 'direct') {
      return 'direct_chat';
    } else {
      return `group_${groupId}`;
    }
  }

  private static addMessage(channelName: string, message: RealtimeMessage): void {
    if (!this.messages.has(channelName)) {
      this.messages.set(channelName, []);
    }
    
    const messages = this.messages.get(channelName)!;
    
    // Check if message already exists (avoid duplicates)
    const existingIndex = messages.findIndex(m => m.id === message.id);
    if (existingIndex === -1) {
      messages.push(message);
      
      // Sort by creation time
      messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
  }

  private static scheduleMessageDeletion(channelName: string, message: RealtimeMessage): void {
    const expiresAt = new Date(message.expires_at).getTime();
    const now = Date.now();
    const delay = expiresAt - now;
    
    if (delay > 0) {
      const timerId = `${channelName}_${message.id}`;
      
      // Clear existing timer if any
      const existingTimer = this.messageTimers.get(timerId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      
      // Set new timer
      const timer = setTimeout(() => {
        this.deleteMessage(channelName, message.id);
        this.messageTimers.delete(timerId);
      }, delay);
      
      this.messageTimers.set(timerId, timer);
    } else {
      // Message already expired
      this.deleteMessage(channelName, message.id);
    }
  }

  private static deleteMessage(channelName: string, messageId: string): void {
    const messages = this.messages.get(channelName);
    if (messages) {
      const index = messages.findIndex(m => m.id === messageId);
      if (index !== -1) {
        console.log(`🗑️ Auto-deleting expired message: ${messageId}`);
        messages.splice(index, 1);
        
        // Notify handler about message deletion
        const handler = this.messageHandlers.get(channelName);
        if (handler) {
          // Create a deletion event by calling handler with updated message list
          // This will trigger UI update to remove the expired message
          messages.forEach(handler);
        }
      }
    }
  }

  private static clearChannelTimers(channelName: string): void {
    const toDelete: string[] = [];
    
    this.messageTimers.forEach((timer, timerId) => {
      if (timerId.startsWith(channelName)) {
        clearTimeout(timer);
        toDelete.push(timerId);
      }
    });
    
    toDelete.forEach(timerId => this.messageTimers.delete(timerId));
  }
}

export default RealtimeMessagingService;