import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User, AuthState, LoginCredentials, GuestSession, UserRole, ApiResponse } from '../types';
import { supabase } from '../lib/supabase';
import { GoogleAuthService } from '../services/googleAuth';

interface AuthContextType extends AuthState {
  // Authentication methods
  loginWithEmail: (credentials: LoginCredentials) => Promise<ApiResponse<User>>;
  loginAsGuest: () => Promise<ApiResponse<GuestSession>>;
  logout: () => void;
  
  // Google OAuth methods
  signInWithGoogle: () => Promise<ApiResponse<void>>;
  signUpWithGoogle: () => Promise<ApiResponse<void>>;
  handleGoogleCallback: () => Promise<ApiResponse<User>>;
  
  // User management
  updateUser: (updates: Partial<User>) => Promise<ApiResponse<User>>;
  registerUser: (email: string, password: string, displayName?: string) => Promise<ApiResponse<User>>;
  
  // Role checking helpers
  hasRole: (role: UserRole) => boolean;
  canAccessGroups: () => boolean;
  canCreateGroups: () => boolean;
  canManageUsers: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

// Generate session token for guest users
const generateSessionToken = (): string => {
  return `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Generate unique guest username
const generateGuestUsername = async (): Promise<string> => {
  try {
    const { data, error } = await supabase.rpc('generate_reddit_style_username');
    if (error) throw error;
    return data || `Guest${Date.now()}`;
  } catch (error) {
    console.error('Error generating username:', error);
    return `Guest${Date.now()}`;
  }
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Derived authentication states
  const isGuest = user?.role === 'guest';
  const isNormal = user?.role === 'normal';
  const isAdmin = user?.role === 'admin';
  const isOperator = user?.role === 'operator';

  // Load saved session on mount and listen for auth changes
  useEffect(() => {
    // Check for existing session first
    const checkSession = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        
        if (sessionData.session) {
          // User is authenticated via OAuth or other means
          const result = await GoogleAuthService.getCurrentUser();
          if (result.success && result.data) {
            setUser(result.data);
            setIsAuthenticated(true);
            localStorage.setItem('openchat_user', JSON.stringify(result.data));
            localStorage.removeItem('openchat_guest_session');
            return;
          }
        }
      } catch (error) {
        console.error('Error checking session:', error);
      }
      
      // Fallback to localStorage check
      const savedUser = localStorage.getItem('openchat_user');
      const savedSession = localStorage.getItem('openchat_guest_session');
      
      if (savedUser) {
        try {
          const parsedUser = JSON.parse(savedUser);
          setUser(parsedUser);
          setIsAuthenticated(true);
        } catch (error) {
          console.error('Error parsing saved user:', error);
          localStorage.removeItem('openchat_user');
        }
      } else if (savedSession) {
        try {
          const session: GuestSession = JSON.parse(savedSession);
          // Check if guest session is still valid
          if (new Date(session.expires_at) > new Date()) {
            // Restore guest user from session
            restoreGuestSession(session);
          } else {
            localStorage.removeItem('openchat_guest_session');
          }
        } catch (error) {
          console.error('Error parsing guest session:', error);
          localStorage.removeItem('openchat_guest_session');
        }
      }
    };
    
    checkSession();
    
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.email);
      
      if (event === 'SIGNED_IN' && session) {
        // For OAuth sign-in, let the callback page handle user creation
        // Only try to get user if we're not on the callback page
        if (!window.location.pathname.includes('/auth/callback')) {
          const result = await GoogleAuthService.getCurrentUser();
          if (result.success && result.data) {
            setUser(result.data);
            setIsAuthenticated(true);
            localStorage.setItem('openchat_user', JSON.stringify(result.data));
            localStorage.removeItem('openchat_guest_session');
          }
        }
      } else if (event === 'SIGNED_OUT') {
        // Handle sign-out
        setUser(null);
        setIsAuthenticated(false);
        localStorage.removeItem('openchat_user');
      }
    });
    
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Update user activity periodically
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const updateActivity = async () => {
      try {
        await supabase
          .from('users_v2')
          .update({ 
            last_active: new Date().toISOString(),
            is_online: true 
          })
          .eq('id', user.id);
      } catch (error) {
        console.error('Failed to update last_active:', error);
      }
    };

    // Update immediately
    updateActivity();
    
    // Update every 30 seconds
    const interval = setInterval(updateActivity, 30000);
    
    // Mark user as offline when leaving
    const handleBeforeUnload = async () => {
      try {
        await supabase
          .from('users_v2')
          .update({ is_online: false })
          .eq('id', user.id);
      } catch (error) {
        console.error('Failed to update offline status:', error);
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Mark user as offline when component unmounts
      if (user) {
        (async () => {
          try {
            await supabase
              .from('users_v2')
              .update({ is_online: false })
              .eq('id', user.id);
          } catch (error: any) {
            console.error('Failed to update offline status:', error);
          }
        })();
      }
    };
  }, [isAuthenticated, user]);

  // Restore guest session
  const restoreGuestSession = async (session: GuestSession) => {
    try {
      // Check if guest user still exists in database
      const { data: existingUser, error } = await supabase
        .from('users_v2')
        .select('*')
        .eq('session_token', session.session_token)
        .eq('role', 'guest')
        .single();

      if (existingUser && !error) {
        setUser(existingUser);
        setIsAuthenticated(true);
      } else {
        // Guest session expired or user doesn't exist
        localStorage.removeItem('openchat_guest_session');
      }
    } catch (error) {
      console.error('Error restoring guest session:', error);
      localStorage.removeItem('openchat_guest_session');
    }
  };

  // Register new user with email/password
  const registerUser = async (email: string, password: string, displayName?: string): Promise<ApiResponse<User>> => {
    try {
      // Generate username
      const username = await generateGuestUsername();
      
      // Register with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) {
        return { success: false, error: authError.message };
      }

      if (!authData.user) {
        return { success: false, error: 'Registration failed' };
      }

      // Create user record in our database
      const { data: newUser, error: dbError } = await supabase
        .from('users_v2')
        .insert({
          id: authData.user.id,
          email,
          username,
          role: 'normal',
          display_name: displayName,
          theme: 'light',
        })
        .select()
        .single();

      if (dbError) {
        return { success: false, error: dbError.message };
      }

      setUser(newUser);
      setIsAuthenticated(true);
      localStorage.setItem('openchat_user', JSON.stringify(newUser));
      localStorage.removeItem('openchat_guest_session');

      return { success: true, data: newUser, message: 'Registration successful' };
    } catch (error: any) {
      console.error('Registration error:', error);
      return { success: false, error: error.message || 'Registration failed' };
    }
  };

  // Login with email and password
  const loginWithEmail = async (credentials: LoginCredentials): Promise<ApiResponse<User>> => {
    try {
      // Authenticate with Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });

      if (authError) {
        return { success: false, error: authError.message };
      }

      if (!authData.user) {
        return { success: false, error: 'Login failed' };
      }

      // Get user data from our database
      const { data: userData, error: dbError } = await supabase
        .from('users_v2')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (dbError) {
        return { success: false, error: dbError.message };
      }

      // Update last active
      const { data: updatedUser, error: updateError } = await supabase
        .from('users_v2')
        .update({ 
          last_active: new Date().toISOString(),
          is_online: true 
        })
        .eq('id', userData.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating last active:', updateError);
      }

      const finalUser = updatedUser || userData;
      setUser(finalUser);
      setIsAuthenticated(true);
      localStorage.setItem('openchat_user', JSON.stringify(finalUser));
      localStorage.removeItem('openchat_guest_session');

      return { success: true, data: finalUser, message: 'Login successful' };
    } catch (error: any) {
      console.error('Login error:', error);
      return { success: false, error: error.message || 'Login failed' };
    }
  };

  // Login as guest
  const loginAsGuest = async (): Promise<ApiResponse<GuestSession>> => {
    try {
      const sessionToken = generateSessionToken();
      const username = await generateGuestUsername();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Create guest user in database
      const { data: guestUser, error: dbError } = await supabase
        .from('users_v2')
        .insert({
          username,
          role: 'guest',
          theme: 'light',
          session_token: sessionToken,
          is_online: true,
        })
        .select()
        .single();

      if (dbError) {
        return { success: false, error: dbError.message };
      }

      const guestSession: GuestSession = {
        session_token: sessionToken,
        username,
        expires_at: expiresAt.toISOString(),
      };

      setUser(guestUser);
      setIsAuthenticated(true);
      localStorage.setItem('openchat_guest_session', JSON.stringify(guestSession));
      localStorage.removeItem('openchat_user');

      return { success: true, data: guestSession, message: 'Guest session created' };
    } catch (error: any) {
      console.error('Guest login error:', error);
      return { success: false, error: error.message || 'Guest login failed' };
    }
  };

  // Logout
  const logout = async () => {
    try {
      // Mark user as offline if authenticated
      if (user) {
        await supabase
          .from('users_v2')
          .update({ is_online: false })
          .eq('id', user.id);
      }

      // Sign out from Supabase if not a guest
      if (!isGuest) {
        await supabase.auth.signOut();
      }

      // Clean up guest user if guest
      if (isGuest && user) {
        await supabase
          .from('users_v2')
          .delete()
          .eq('id', user.id);
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local state and storage
      setUser(null);
      setIsAuthenticated(false);
      localStorage.removeItem('openchat_user');
      localStorage.removeItem('openchat_guest_session');
    }
  };

  // Update user
  const updateUser = async (updates: Partial<User>): Promise<ApiResponse<User>> => {
    if (!user) {
      return { success: false, error: 'No user logged in' };
    }

    try {
      const { data: updatedUser, error } = await supabase
        .from('users_v2')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      setUser(updatedUser);
      
      // Update localStorage
      if (isGuest) {
        const savedSession = localStorage.getItem('openchat_guest_session');
        if (savedSession) {
          const session = JSON.parse(savedSession);
          session.username = updatedUser.username;
          localStorage.setItem('openchat_guest_session', JSON.stringify(session));
        }
      } else {
        localStorage.setItem('openchat_user', JSON.stringify(updatedUser));
      }

      return { success: true, data: updatedUser, message: 'User updated successfully' };
    } catch (error: any) {
      console.error('Update user error:', error);
      return { success: false, error: error.message || 'Update failed' };
    }
  };

  // Role checking helpers
  const hasRole = (role: UserRole): boolean => {
    return user?.role === role;
  };

  const canAccessGroups = (): boolean => {
    return user?.role !== 'guest';
  };

  const canCreateGroups = (): boolean => {
    return user?.role === 'normal' || user?.role === 'admin' || user?.role === 'operator';
  };

  const canManageUsers = (): boolean => {
    return user?.role === 'admin' || user?.role === 'operator';
  };

  // Google OAuth methods
  const signInWithGoogle = async (): Promise<ApiResponse<void>> => {
    return GoogleAuthService.signInWithGoogle();
  };

  const signUpWithGoogle = async (): Promise<ApiResponse<void>> => {
    return GoogleAuthService.signUpWithGoogle();
  };

  const handleGoogleCallback = async (): Promise<ApiResponse<User>> => {
    try {
      const result = await GoogleAuthService.handleGoogleCallback();
      
      if (result.success && result.data) {
        setUser(result.data);
        setIsAuthenticated(true);
        localStorage.setItem('openchat_user', JSON.stringify(result.data));
        localStorage.removeItem('openchat_guest_session');
      }
      
      return result;
    } catch (error: any) {
      console.error('Error in Google callback handler:', error);
      return {
        success: false,
        error: error.message || 'Failed to handle Google callback',
      };
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isGuest,
    isNormal,
    isAdmin,
    isOperator,
    loginWithEmail,
    loginAsGuest,
    logout,
    signInWithGoogle,
    signUpWithGoogle,
    handleGoogleCallback,
    updateUser,
    registerUser,
    hasRole,
    canAccessGroups,
    canCreateGroups,
    canManageUsers,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};