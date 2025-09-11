import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User, AuthState } from '../types';
import { supabase } from '../lib/supabase';

interface AuthContextType extends AuthState {
  login: (username: string, isOP?: boolean, password?: string) => Promise<boolean>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => Promise<void>;
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

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isOP, setIsOP] = useState(false);

  useEffect(() => {
    // Check if user is already logged in (from localStorage)
    const savedUser = localStorage.getItem('chat_user');
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      setIsAuthenticated(true);
      setIsOP(parsedUser.is_op);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const interval = setInterval(async () => {
      try {
        await supabase
          .from('users')
          .update({ last_active: new Date().toISOString() })
          .eq('id', user.id);
      } catch (error) {
        console.error('Failed to update last_active:', error);
      }
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [isAuthenticated, user]);

  const login = async (username: string, isOPLogin = false, password?: string): Promise<boolean> => {
    try {
      // For OP login, verify credentials
      if (isOPLogin) {
        if (username !== 'Shyamnath-sankar' || password !== 'shyam@2005') {
          return false;
        }
      }

      // Check if user already exists in database
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .eq('is_op', isOPLogin)
        .single();

      let userData: User;

      if (existingUser && !fetchError) {
        // Update last_active for existing user
        const { data: updatedUser, error: updateError } = await supabase
          .from('users')
          .update({ last_active: new Date().toISOString() })
          .eq('id', existingUser.id)
          .select()
          .single();

        if (updateError) throw updateError;
        userData = updatedUser;
      } else {
        // Create new user
        const { data: newUser, error: insertError } = await supabase
          .from('users')
          .insert([
            {
              username,
              is_op: isOPLogin,
              theme: 'light',
            },
          ])
          .select()
          .single();

        if (insertError) throw insertError;
        userData = newUser;
      }

      setUser(userData);
      setIsAuthenticated(true);
      setIsOP(userData.is_op);
      localStorage.setItem('chat_user', JSON.stringify(userData));
      
      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    setIsOP(false);
    localStorage.removeItem('chat_user');
  };

  const updateUser = async (updates: Partial<User>) => {
    if (!user) return;

    try {
      const { data: updatedUser, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;

      setUser(updatedUser);
      localStorage.setItem('chat_user', JSON.stringify(updatedUser));
    } catch (error) {
      console.error('Update user error:', error);
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isOP,
    login,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};