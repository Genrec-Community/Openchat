import { supabase } from '../lib/supabase';
import type { User, ApiResponse } from '../types';

/**
 * Google OAuth Authentication Service
 * Handles Google sign-in, sign-up, and callback processing using Supabase Auth
 */
export class GoogleAuthService {
  private static readonly REDIRECT_URL = `${window.location.origin}/auth/callback`;
  
  /**
   * Initiate Google OAuth sign-in flow
   * This will redirect the user to Google's OAuth consent screen
   */
  static async signInWithGoogle(): Promise<ApiResponse<void>> {
    try {
      console.log('🚀 Initiating Google OAuth sign-in...');
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: this.REDIRECT_URL,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
          scopes: 'email profile',
        },
      });

      if (error) {
        console.error('❌ Google OAuth initiation failed:', error);
        return {
          success: false,
          error: error.message,
        };
      }

      console.log('✅ Google OAuth initiated successfully');
      return {
        success: true,
        message: 'Redirecting to Google...',
      };
    } catch (error: any) {
      console.error('❌ Unexpected error during Google OAuth:', error);
      return {
        success: false,
        error: error.message || 'Failed to initiate Google sign-in',
      };
    }
  }

  /**
   * Sign up with Google (same as sign-in for OAuth)
   * Google OAuth automatically handles both existing and new users
   */
  static async signUpWithGoogle(): Promise<ApiResponse<void>> {
    // For OAuth providers, sign-up and sign-in are the same process
    return this.signInWithGoogle();
  }

  /**
   * Handle the OAuth callback after successful Google authentication
   * This should be called on the callback page
   */
  static async handleGoogleCallback(): Promise<ApiResponse<User>> {
    try {
      console.log('🔄 Processing Google OAuth callback...');
      
      // Get the session from the URL hash/query params
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('❌ Failed to get session from callback:', sessionError);
        return {
          success: false,
          error: `Session error: ${sessionError.message}`,
        };
      }

      if (!sessionData.session) {
        console.warn('⚠️ No session found in callback');
        return {
          success: false,
          error: 'No authentication session found. Please try signing in again.',
        };
      }

      const { user: supabaseUser } = sessionData.session;
      
      if (!supabaseUser) {
        return {
          success: false,
          error: 'No user data received from Google. Please try again.',
        };
      }

      console.log('✅ Google OAuth session established:', supabaseUser.email);
      console.log('🔍 Supabase user data:', {
        id: supabaseUser.id,
        email: supabaseUser.email,
        metadata: supabaseUser.user_metadata
      });

      // Create or update user in our database
      const userResult = await this.createOrUpdateUser(supabaseUser);
      
      if (!userResult.success) {
        console.error('❌ User creation/update failed:', userResult.error);
        return userResult;
      }

      console.log('✅ User successfully processed:', userResult.data?.username);
      return {
        success: true,
        data: userResult.data!,
        message: 'Successfully authenticated with Google',
      };
    } catch (error: any) {
      console.error('❌ Error processing Google callback:', error);
      return {
        success: false,
        error: `Callback processing failed: ${error.message || error}`,
      };
    }
  }

  /**
   * Create or update user in our database after successful Google OAuth
   */
  private static async createOrUpdateUser(supabaseUser: any): Promise<ApiResponse<User>> {
    try {
      const userEmail = supabaseUser.email;
      const userName = supabaseUser.user_metadata?.full_name || 
                      supabaseUser.user_metadata?.name || 
                      userEmail?.split('@')[0] || 
                      'GoogleUser';
      
      console.log('🔍 Attempting to create/update user:', {
        id: supabaseUser.id,
        email: userEmail,
        name: userName
      });
      
      // Check if user already exists
      const { data: existingUser, error: checkError } = await supabase
        .from('users_v2')
        .select('*')
        .eq('id', supabaseUser.id)
        .maybeSingle(); // Use maybeSingle instead of single to avoid error on no results

      if (checkError) {
        console.error('❌ Error checking existing user:', checkError);
        return {
          success: false,
          error: `Database check failed: ${checkError.message}`,
        };
      }

      let user: User;

      if (existingUser) {
        // Update existing user
        console.log('🔄 Updating existing user:', existingUser.email);
        
        const { data: updatedUser, error: updateError } = await supabase
          .from('users_v2')
          .update({
            email: userEmail,
            display_name: userName,
            last_active: new Date().toISOString(),
            is_online: true,
          })
          .eq('id', supabaseUser.id)
          .select()
          .single();

        if (updateError) {
          console.error('❌ Failed to update user:', updateError);
          return {
            success: false,
            error: `User update failed: ${updateError.message}`,
          };
        }

        user = updatedUser;
      } else {
        // Create new user
        console.log('✨ Creating new user for Google OAuth:', userEmail);
        
        // Generate a unique username
        const username = await this.generateUniqueUsername(userName);
        console.log('🔍 Generated username:', username);
        
        const newUserData = {
          id: supabaseUser.id,
          email: userEmail,
          username,
          display_name: userName,
          role: 'normal' as const, // Google users get normal role by default
          theme: 'light',
          is_online: true,
          last_active: new Date().toISOString(),
          created_at: new Date().toISOString(),
        };
        
        console.log('🔍 Inserting user data:', newUserData);
        
        // Try direct insert first
        let createResult = await supabase
          .from('users_v2')
          .insert([newUserData])
          .select()
          .single();

        // If direct insert fails due to RLS, try using a function
        if (createResult.error) {
          console.log('🔄 Direct insert failed, trying RPC function...');
          
          // Try using a stored procedure that bypasses RLS
          const { data: rpcResult, error: rpcError } = await supabase.rpc('create_oauth_user', {
            user_id: supabaseUser.id,
            user_email: userEmail,
            user_username: username,
            user_display_name: userName,
            user_role: 'normal',
          });
          
          if (rpcError) {
            console.log('🔄 RPC also failed, trying service role...');
            
            // Final fallback: use the anon client with special handling
            createResult = await supabase
              .from('users_v2')
              .upsert(newUserData, { 
                onConflict: 'id',
                ignoreDuplicates: false 
              })
              .select()
              .single();
          } else {
            // RPC succeeded, fetch the created user
            const { data: fetchedUser, error: fetchError } = await supabase
              .from('users_v2')
              .select('*')
              .eq('id', supabaseUser.id)
              .single();
              
            if (fetchError) {
              return {
                success: false,
                error: `User created but fetch failed: ${fetchError.message}`,
              };
            }
            
            user = fetchedUser;
          }
        }
        
        // Check final result
        if (createResult.error) {
          console.error('❌ All user creation methods failed:', createResult.error);
          
          // Try a more detailed error message
          if (createResult.error.code === '42501') {
            return {
              success: false,
              error: 'Database permission error. Please contact administrator.',
            };
          }
          
          return {
            success: false,
            error: `User creation failed: ${createResult.error.message} (Code: ${createResult.error.code})`,
          };
        }
        
        if (!user) {
          user = createResult.data;
        }
      }

      console.log('✅ User processed successfully:', user.username);
      return {
        success: true,
        data: user,
      };
    } catch (error: any) {
      console.error('❌ Error creating/updating user:', error);
      return {
        success: false,
        error: `User processing failed: ${error.message || error}`,
      };
    }
  }

  /**
   * Generate a unique username based on the user's display name
   */
  private static async generateUniqueUsername(baseName: string): Promise<string> {
    try {
      // Clean the base name (remove spaces, special characters)
      let cleanBaseName = baseName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 20);

      if (!cleanBaseName) {
        cleanBaseName = 'googleuser';
      }

      // Try the base name first
      const { data: existingUser } = await supabase
        .from('users_v2')
        .select('username')
        .eq('username', cleanBaseName)
        .single();

      if (!existingUser) {
        return cleanBaseName;
      }

      // If base name exists, try with numbers
      for (let i = 1; i <= 999; i++) {
        const candidateUsername = `${cleanBaseName}${i}`;
        
        const { data: existingUserWithNumber } = await supabase
          .from('users_v2')
          .select('username')
          .eq('username', candidateUsername)
          .single();

        if (!existingUserWithNumber) {
          return candidateUsername;
        }
      }

      // Fallback to random username
      return `googleuser${Date.now()}`;
    } catch (error) {
      console.error('❌ Error generating username:', error);
      return `googleuser${Date.now()}`;
    }
  }

  /**
   * Sign out the current user
   */
  static async signOut(): Promise<ApiResponse<void>> {
    try {
      console.log('🚪 Signing out Google user...');
      
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('❌ Sign out failed:', error);
        return {
          success: false,
          error: error.message,
        };
      }

      console.log('✅ Successfully signed out');
      return {
        success: true,
        message: 'Successfully signed out',
      };
    } catch (error: any) {
      console.error('❌ Error during sign out:', error);
      return {
        success: false,
        error: error.message || 'Failed to sign out',
      };
    }
  }

  /**
   * Get the current authenticated user
   */
  static async getCurrentUser(): Promise<ApiResponse<User | null>> {
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('❌ Failed to get session:', sessionError);
        return {
          success: false,
          error: sessionError.message,
        };
      }

      if (!sessionData.session) {
        return {
          success: true,
          data: null,
          message: 'No active session',
        };
      }

      const { user: supabaseUser } = sessionData.session;
      
      // Get user data from our database
      const { data: userData, error: userError } = await supabase
        .from('users_v2')
        .select('*')
        .eq('id', supabaseUser.id)
        .single();

      if (userError) {
        console.error('❌ Failed to get user data:', userError);
        return {
          success: false,
          error: userError.message,
        };
      }

      return {
        success: true,
        data: userData,
      };
    } catch (error: any) {
      console.error('❌ Error getting current user:', error);
      return {
        success: false,
        error: error.message || 'Failed to get current user',
      };
    }
  }

  /**
   * Check if the current session is valid
   */
  static async isAuthenticated(): Promise<boolean> {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      return !!sessionData.session;
    } catch (error) {
      console.error('❌ Error checking authentication:', error);
      return false;
    }
  }

  /**
   * Refresh the current session
   */
  static async refreshSession(): Promise<ApiResponse<void>> {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      return {
        success: true,
        message: 'Session refreshed successfully',
      };
    } catch (error: any) {
      console.error('❌ Error refreshing session:', error);
      return {
        success: false,
        error: error.message || 'Failed to refresh session',
      };
    }
  }
}

export default GoogleAuthService;