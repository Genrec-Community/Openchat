// User roles in the new system
export type UserRole = 'guest' | 'normal' | 'admin' | 'operator';

// Enhanced user interface with roles
export interface User {
  id: string;
  email?: string; // Optional for guest users
  username: string; // Auto-generated Reddit-style username
  role: UserRole;
  display_name?: string; // Optional display name
  theme: 'light' | 'dark';
  created_at: string;
  last_active: string;
  is_online: boolean;
  session_token?: string; // For guest users
}

// Group interface
export interface Group {
  id: string;
  name: string;
  description?: string;
  access_code: string;
  admin_user_id: string;
  message_deletion_timer: number; // in seconds
  max_members: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Group membership interface
export interface GroupMember {
  id: string;
  user_id: string;
  group_id: string;
  joined_at: string;
  role: 'member' | 'moderator';
  is_active: boolean;
}

// Group with member details
export interface GroupWithDetails extends Group {
  member_count: number;
  user_role?: 'member' | 'moderator' | 'admin';
  members?: GroupMemberWithUser[];
}

// Group member with user details
export interface GroupMemberWithUser extends GroupMember {
  username: string;
  display_name?: string;
  user_role: UserRole;
  group_name: string;
}

// Real-time message interface (not stored in database)
export interface RealtimeMessage {
  id: string; // Temporary ID for client-side tracking
  user_id: string;
  username: string;
  display_name?: string;
  content: string;
  created_at: string;
  expires_at: string; // When message should be auto-deleted
  group_id?: string; // For group messages
  message_type: 'direct' | 'group';
  user_role: UserRole;
}

// Authentication state with new roles
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  isNormal: boolean;
  isAdmin: boolean;
  isOperator: boolean;
}

// Login credentials
export interface LoginCredentials {
  email: string;
  password: string;
}

// Guest session info
export interface GuestSession {
  session_token: string;
  username: string;
  expires_at: string;
}

// Group creation data
export interface CreateGroupData {
  name: string;
  description?: string;
  message_deletion_timer?: number;
  max_members?: number;
}

// Join group data
export interface JoinGroupData {
  access_code: string;
}

export type Theme = 'light' | 'dark';

// Chat contexts
export type ChatContext = 'direct' | 'group';

// Message deletion timer options (in seconds)
export const MESSAGE_DELETION_TIMERS = {
  FIVE_MINUTES: 300,
  FIFTEEN_MINUTES: 900,
  ONE_HOUR: 3600,
  SIX_HOURS: 21600,
  ONE_DAY: 86400,
  ONE_WEEK: 604800,
} as const;

// API response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Realtime channel types
export type RealtimeChannel = 'direct_chat' | `group_${string}`;

// User online status
export interface UserOnlineStatus {
  user_id: string;
  username: string;
  is_online: boolean;
  last_seen: string;
}

// Notification types
export type NotificationType = 
  | 'group_join_request'
  | 'group_join_approved'
  | 'group_join_denied'
  | 'group_member_removed'
  | 'group_admin_changed'
  | 'group_deleted'
  | 'group_settings_updated'
  | 'message_mention'
  | 'system_announcement';

// Notification interface
export interface Notification {
  id: string;
  recipient_id: string;
  sender_id?: string;
  notification_type: NotificationType;
  title: string;
  message: string;
  data?: any; // JSONB data
  is_read: boolean;
  created_at: string;
  expires_at: string;
}

// Group join request interface
export interface GroupJoinRequest {
  id: string;
  user_id: string;
  group_id: string;
  message?: string;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
  processed_at?: string;
  processed_by?: string;
  // Populated fields
  username?: string;
  display_name?: string;
  group_name?: string;
}

// Join request with user details
export interface GroupJoinRequestWithDetails extends GroupJoinRequest {
  username: string;
  display_name?: string;
  user_role: UserRole;
  group_name: string;
}