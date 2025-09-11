export interface User {
  id: string;
  username: string;
  is_op: boolean;
  theme: 'light' | 'dark';
  created_at: string;
  last_active: string;
}

export interface Message {
  id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
  expires_at: string;
}

export interface PinnedMessage {
  id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isOP: boolean;
}

export type Theme = 'light' | 'dark';