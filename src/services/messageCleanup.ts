import { supabase } from '../lib/supabase';

class MessageCleanupService {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds

  // Start the cleanup service
  start() {
    if (this.intervalId) {
      return; // Already running
    }

    // Run cleanup immediately
    this.cleanup();

    // Set up periodic cleanup
    this.intervalId = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL);

    console.log('Message cleanup service started');
  }

  // Stop the cleanup service
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Message cleanup service stopped');
    }
  }

  // Clean up expired messages
  private async cleanup() {
    try {
      const now = new Date().toISOString();
      
      // Delete expired messages
      const { count, error } = await supabase
        .from('messages')
        .delete()
        .lt('expires_at', now);

      if (error) {
        console.error('Error during message cleanup:', error);
        return;
      }

      if (count && count > 0) {
        console.log(`Cleaned up ${count} expired messages`);
      }

      // Also clean up old inactive users (optional - users inactive for more than 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      
      const { error: userCleanupError } = await supabase
        .from('users')
        .delete()
        .lt('last_active', sevenDaysAgo)
        .eq('is_op', false); // Don't delete OP users

      if (userCleanupError) {
        console.error('Error during user cleanup:', userCleanupError);
      }

    } catch (error) {
      console.error('Unexpected error during cleanup:', error);
    }
  }

  // Manually trigger cleanup
  async triggerCleanup() {
    await this.cleanup();
  }

  // Check if a message is expired
  isMessageExpired(expiresAt: string): boolean {
    return new Date(expiresAt) <= new Date();
  }

  // Get time remaining for a message
  getTimeRemaining(expiresAt: string): {
    hours: number;
    minutes: number;
    expired: boolean;
  } {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    
    if (diff <= 0) {
      return { hours: 0, minutes: 0, expired: true };
    }
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return { hours, minutes, expired: false };
  }

  // Format time remaining as string
  formatTimeRemaining(expiresAt: string): string {
    const { hours, minutes, expired } = this.getTimeRemaining(expiresAt);
    
    if (expired) {
      return 'Expired';
    }
    
    if (hours === 0) {
      return `${minutes}m left`;
    }
    
    return `${hours}h ${minutes}m left`;
  }
}

// Export singleton instance
export const messageCleanupService = new MessageCleanupService();

// Export the class for testing
export { MessageCleanupService };