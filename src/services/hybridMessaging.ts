import { supabase } from '../lib/supabase';
import type { RealtimeMessage, RealtimeChannel, ChatContext } from '../types';

/**
 * Hybrid Messaging Service
 * Combines real-time delivery with database persistence
 * Messages arrive instantly via real-time channels AND are stored in database
 */
export class HybridMessagingService {
  private static channels = new Map<string, any>();
  private static messageHandlers = new Map<string, (message: RealtimeMessage) => void>();

  /**
   * Subscribe to a chat channel (hybrid approach)
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
    
    console.log(`🔌 Subscribing to hybrid channel: ${channelName}`);
    
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false },
        presence: { key: `user-${Date.now()}` },
      },
    });

    // 1. Subscribe to database changes (INSERT events) for persistence
    channel.on(
      'postgres_changes',
      { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages_v2',
        filter: context === 'direct' 
          ? 'message_type=eq.direct'
          : `group_id=eq.${groupId}`
      },
      (payload) => {
        console.log('📨 Received database message:', payload.new);
        const dbMessage = payload.new as any;
        
        const realtimeMessage: RealtimeMessage = {
          id: dbMessage.id,
          user_id: dbMessage.user_id,
          username: dbMessage.username,
          display_name: dbMessage.display_name,
          content: dbMessage.content,
          created_at: dbMessage.created_at,
          expires_at: dbMessage.expires_at,
          group_id: dbMessage.group_id,
          message_type: dbMessage.message_type,
          user_role: dbMessage.user_role,
        };
        
        onMessage(realtimeMessage);
      }
    );

    // 2. Subscribe to broadcast messages for instant delivery (backup)
    channel.on('broadcast', { event: 'new_message' }, (payload) => {
      console.log('📨 Received broadcast message:', payload.payload);
      onMessage(payload.payload);
    });

    // 3. Subscribe to message deletion events
    channel.on(
      'postgres_changes',
      { 
        event: 'DELETE', 
        schema: 'public', 
        table: 'messages_v2'
      },
      (payload) => {
        console.log('🗑️ Message deleted from database:', payload.old);
        // Handle message deletion in UI (could emit a deletion event)
      }
    );

    // Handle user presence
    if (onUserJoin || onUserLeave) {
      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        console.log('👥 Presence state changed:', state);
      });
      
      channel.on('presence', { event: 'join' }, ({ newPresences }: any) => {
        console.log('👋 User joined:', newPresences);
        newPresences.forEach((presence: any) => onUserJoin?.(presence.user));
      });
      
      channel.on('presence', { event: 'leave' }, ({ leftPresences }: any) => {
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
   * Send message with hybrid approach: real-time delivery + database persistence
   */
  static async sendMessage(
    content: string,
    context: ChatContext,
    groupId: string | null,
    user: any,
    customRetentionHours?: number
  ): Promise<RealtimeMessage> {
    const channelName = this.getChannelName(context, groupId);
    
    try {
      console.log('📤 Sending message with hybrid approach:', content);
      
      // 1. Store message in database using the guest-compatible function
      const { data: messageId, error: dbError } = await supabase.rpc('send_message_v2_guest', {
        p_user_id: user.id,
        p_content: content,
        p_message_type: context,
        p_group_id: groupId,
        p_custom_retention_hours: customRetentionHours
      });

      if (dbError) {
        console.error('❌ Database storage failed:', dbError);
        throw new Error(`Failed to store message: ${dbError.message}`);
      }

      console.log('✅ Message stored in database with ID:', messageId);

      // 2. Fetch the complete message from database (with all metadata)
      const { data: storedMessage, error: fetchError } = await supabase
        .from('messages_v2')
        .select('*')
        .eq('id', messageId)
        .single();

      if (fetchError) {
        console.error('❌ Failed to fetch stored message:', fetchError);
        throw new Error(`Failed to fetch message: ${fetchError.message}`);
      }

      // 3. Convert to RealtimeMessage format
      const realtimeMessage: RealtimeMessage = {
        id: storedMessage.id,
        user_id: storedMessage.user_id,
        username: storedMessage.username,
        display_name: storedMessage.display_name,
        content: storedMessage.content,
        created_at: storedMessage.created_at,
        expires_at: storedMessage.expires_at,
        group_id: storedMessage.group_id,
        message_type: storedMessage.message_type,
        user_role: storedMessage.user_role,
      };

      // 4. Broadcast for instant delivery (backup to postgres_changes)
      const channel = this.channels.get(channelName);
      if (channel) {
        const broadcastResult = await channel.send({
          type: 'broadcast',
          event: 'new_message',
          payload: realtimeMessage,
        });

        if (broadcastResult === 'ok') {
          console.log('✅ Message broadcasted for instant delivery');
        } else {
          console.warn('⚠️ Broadcast failed, but message is stored in DB:', broadcastResult);
        }
      }

      return realtimeMessage;
    } catch (error) {
      console.error('❌ Failed to send message:', error);
      throw error;
    }
  }

  /**
   * Load message history from database
   */
  static async loadMessageHistory(
    context: ChatContext,
    groupId?: string,
    limit: number = 50
  ): Promise<RealtimeMessage[]> {
    try {
      console.log('📚 Loading message history from database:', context, groupId);
      
      let query = supabase
        .from('messages_v2')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(limit);

      // Filter by message type
      if (context === 'direct') {
        query = query.eq('message_type', 'direct');
      } else if (context === 'group' && groupId) {
        query = query.eq('message_type', 'group').eq('group_id', groupId);
      }

      const { data: messages, error } = await query;

      if (error) {
        console.error('❌ Failed to load message history:', error);
        throw new Error(`Failed to load messages: ${error.message}`);
      }

      const realtimeMessages: RealtimeMessage[] = (messages || []).map(msg => ({
        id: msg.id,
        user_id: msg.user_id,
        username: msg.username,
        display_name: msg.display_name,
        content: msg.content,
        created_at: msg.created_at,
        expires_at: msg.expires_at,
        group_id: msg.group_id,
        message_type: msg.message_type,
        user_role: msg.user_role,
      }));

      console.log(`✅ Loaded ${realtimeMessages.length} messages from history`);
      return realtimeMessages;
    } catch (error) {
      console.error('❌ Error loading message history:', error);
      return [];
    }
  }

  /**
   * Get message retention settings from database
   */
  static async getMessageRetentionHours(): Promise<number> {
    try {
      const { data, error } = await supabase.rpc('get_message_retention_hours');
      
      if (error) {
        console.error('❌ Failed to get retention settings:', error);
        return 24; // Default fallback
      }
      
      return data || 24;
    } catch (error) {
      console.error('❌ Error getting retention settings:', error);
      return 24; // Default fallback
    }
  }

  /**
   * Update message retention settings (Operator only)
   */
  static async updateMessageRetentionHours(hours: number, operatorUserId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('app_settings')
        .update({ 
          setting_value: hours.toString(),
          updated_by: operatorUserId,
          updated_at: new Date().toISOString()
        })
        .eq('setting_key', 'default_message_retention_hours');

      if (error) {
        console.error('❌ Failed to update retention settings:', error);
        return false;
      }

      console.log(`✅ Updated message retention to ${hours} hours`);
      return true;
    } catch (error) {
      console.error('❌ Error updating retention settings:', error);
      return false;
    }
  }

  /**
   * Manual cleanup of expired messages (Operator only)
   */
  static async cleanupExpiredMessages(): Promise<number> {
    try {
      const { data: deletedCount, error } = await supabase.rpc('cleanup_expired_messages');
      
      if (error) {
        console.error('❌ Failed to cleanup expired messages:', error);
        return 0;
      }
      
      console.log(`✅ Cleaned up ${deletedCount} expired messages`);
      return deletedCount || 0;
    } catch (error) {
      console.error('❌ Error cleaning up messages:', error);
      return 0;
    }
  }

  /**
   * Get message statistics (for Operators)
   */
  static async getMessageStatistics(): Promise<{
    totalMessages: number;
    messagesLast24h: number;
    averageRetentionHours: number;
    nextCleanupTime: string;
  }> {
    try {
      const { count: totalMessages } = await supabase
        .from('messages_v2')
        .select('*', { count: 'exact', head: true });

      const { count: messagesLast24h } = await supabase
        .from('messages_v2')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      const retentionHours = await this.getMessageRetentionHours();

      return {
        totalMessages: totalMessages || 0,
        messagesLast24h: messagesLast24h || 0,
        averageRetentionHours: retentionHours,
        nextCleanupTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // Next hour
      };
    } catch (error) {
      console.error('❌ Error getting message statistics:', error);
      return {
        totalMessages: 0,
        messagesLast24h: 0,
        averageRetentionHours: 24,
        nextCleanupTime: new Date().toISOString(),
      };
    }
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
   * Unsubscribe from a channel
   */
  static unsubscribe(channelName: string): void {
    const channel = this.channels.get(channelName);
    if (channel) {
      console.log(`🔌 Unsubscribing from channel: ${channelName}`);
      supabase.removeChannel(channel);
      this.channels.delete(channelName);
      this.messageHandlers.delete(channelName);
    }
  }

  /**
   * Clean up all subscriptions
   */
  static cleanup(): void {
    console.log('🧹 Cleaning up all hybrid subscriptions');
    
    // Unsubscribe from all channels
    this.channels.forEach((channel, channelName) => {
      this.unsubscribe(channelName);
    });
  }

  // Private helper methods

  private static getChannelName(context: ChatContext, groupId: string | null): string {
    if (context === 'direct') {
      return 'direct_chat';
    } else {
      return `group_${groupId}`;
    }
  }
}

export default HybridMessagingService;