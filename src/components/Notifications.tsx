import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Bell, X, Check, Users, Crown, AlertCircle, Info } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Notification, GroupJoinRequest } from '../types';

interface NotificationsProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

const Notifications: React.FC<NotificationsProps> = ({ isOpen, onClose, className = '' }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [joinRequests, setJoinRequests] = useState<GroupJoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const { user } = useAuth();
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user || !isOpen) return;

    loadNotifications();
    loadJoinRequests();
    
    // Set up real-time subscription for notifications
    const notificationChannel = supabase
      .channel('user_notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Notification change:', payload);
          if (payload.eventType === 'INSERT') {
            setNotifications(prev => [payload.new as Notification, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setNotifications(prev => 
              prev.map(n => n.id === payload.new.id ? payload.new as Notification : n)
            );
          } else if (payload.eventType === 'DELETE') {
            setNotifications(prev => prev.filter(n => n.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    // Set up real-time subscription for join requests (if user is group admin)
    const joinRequestChannel = supabase
      .channel('user_join_requests')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_join_requests'
        },
        (payload) => {
          console.log('Join request change:', payload);
          loadJoinRequests(); // Reload to ensure proper filtering
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notificationChannel);
      supabase.removeChannel(joinRequestChannel);
    };
  }, [user, isOpen]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (overlayRef.current && event.target === overlayRef.current) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const loadNotifications = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', user.id)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadJoinRequests = async () => {
    if (!user) return;

    try {
      // Get join requests for groups where user is admin
      const { data, error } = await supabase
        .from('group_join_requests')
        .select(`
          *,
          users_v2!group_join_requests_user_id_fkey(
            username,
            display_name,
            role
          ),
          groups!group_join_requests_group_id_fkey(
            name,
            admin_user_id
          )
        `)
        .eq('status', 'pending')
        .eq('groups.admin_user_id', user.id);

      if (error) throw error;
      
      const requests = (data || []).map(request => ({
        ...request,
        username: request.users_v2?.username || '',
        display_name: request.users_v2?.display_name,
        user_role: request.users_v2?.role || 'guest',
        group_name: request.groups?.name || ''
      }));
      
      setJoinRequests(requests);
    } catch (error) {
      console.error('Error loading join requests:', error);
    }
  };

  const markAsRead = async (notificationId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase.rpc('mark_notification_read', {
        p_notification_id: notificationId,
        p_user_id: user.id
      });

      if (error) throw error;
      
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const processJoinRequest = async (requestId: string, approved: boolean, message?: string) => {
    if (!user) return;

    setProcessing(requestId);
    try {
      const { error } = await supabase.rpc('process_join_request', {
        p_request_id: requestId,
        p_admin_id: user.id,
        p_approved: approved,
        p_admin_message: message
      });

      if (error) throw error;
      
      // Remove processed request from list
      setJoinRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (error) {
      console.error('Error processing join request:', error);
    } finally {
      setProcessing(null);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'group_join_request':
      case 'group_join_approved':
      case 'group_join_denied':
        return <Users className="w-5 h-5" />;
      case 'group_admin_changed':
        return <Crown className="w-5 h-5" />;
      case 'system_announcement':
        return <AlertCircle className="w-5 h-5" />;
      default:
        return <Info className="w-5 h-5" />;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'group_join_approved':
        return 'text-green-600 dark:text-green-400';
      case 'group_join_denied':
      case 'group_member_removed':
        return 'text-red-600 dark:text-red-400';
      case 'group_join_request':
        return 'text-blue-600 dark:text-blue-400';
      case 'group_admin_changed':
        return 'text-amber-600 dark:text-amber-400';
      default:
        return 'text-zinc-600 dark:text-zinc-400';
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const totalItems = notifications.length + joinRequests.length;

  if (!isOpen) return null;

  return (
    <div 
      ref={overlayRef}
      className={`fixed inset-0 bg-black/30 flex items-start justify-end pt-16 pr-4 z-50 ${className}`}
    >
      <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center space-x-2">
            <Bell className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />
            <h3 className="font-semibold text-zinc-900 dark:text-white">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                {unreadCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-500 border-t-transparent" />
            </div>
          ) : totalItems === 0 ? (
            <div className="text-center py-8 px-4">
              <Bell className="w-12 h-12 text-zinc-400 mx-auto mb-3" />
              <p className="text-zinc-500 dark:text-zinc-400">
                No notifications yet
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
              {/* Join Requests Section */}
              {joinRequests.length > 0 && (
                <div className="p-4">
                  <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                    Pending Join Requests
                  </h4>
                  <div className="space-y-3">
                    {joinRequests.map((request) => (
                      <div
                        key={request.id}
                        className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-zinc-900 dark:text-white">
                              {request.display_name || request.username}
                            </p>
                            <p className="text-xs text-zinc-600 dark:text-zinc-400">
                              wants to join \"{request.group_name}\"
                            </p>
                            {request.message && (
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 italic">
                                \"{request.message}\"
                              </p>
                            )}
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                              {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                        <div className="flex space-x-2 mt-3">
                          <button
                            onClick={() => processJoinRequest(request.id, true)}
                            disabled={processing === request.id}
                            className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs rounded transition-colors"
                          >
                            {processing === request.id ? 'Processing...' : 'Approve'}
                          </button>
                          <button
                            onClick={() => processJoinRequest(request.id, false)}
                            disabled={processing === request.id}
                            className="flex-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs rounded transition-colors"
                          >
                            Deny
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notifications Section */}
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors ${
                    notification.is_read ? 'opacity-75' : ''
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <div className={`flex-shrink-0 ${getNotificationColor(notification.notification_type)}`}>
                      {getNotificationIcon(notification.notification_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-zinc-900 dark:text-white">
                            {notification.title}
                          </p>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                            {notification.message}
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                          </p>
                        </div>
                        {!notification.is_read && (
                          <button
                            onClick={() => markAsRead(notification.id)}
                            className="ml-2 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-600 rounded transition-colors"
                            title="Mark as read"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {totalItems > 0 && (
          <div className="p-3 border-t border-zinc-200 dark:border-zinc-700 text-center">
            <button
              onClick={() => {
                // Mark all as read
                notifications.forEach(n => {
                  if (!n.is_read) markAsRead(n.id);
                });
              }}
              className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
            >
              Mark all as read
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Notifications;