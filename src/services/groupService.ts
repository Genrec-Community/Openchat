import { supabase } from '../lib/supabase';
import type { 
  Group, 
  GroupWithDetails, 
  CreateGroupData, 
  JoinGroupData, 
  ApiResponse
} from '../types';

/**
 * Group Management Service
 * Handles all group-related operations including creation, joining, and management
 */
export class GroupService {
  /**
   * Create a new group
   */
  static async createGroup(data: CreateGroupData, userId: string): Promise<ApiResponse<Group>> {
    try {
      // Generate access code using database function
      const { data: accessCode, error: codeError } = await supabase.rpc('generate_access_code');
      
      if (codeError) {
        return { success: false, error: codeError.message };
      }

      // Create the group
      const { data: newGroup, error: groupError } = await supabase
        .from('groups')
        .insert({
          name: data.name,
          description: data.description,
          access_code: accessCode,
          admin_user_id: userId,
          message_deletion_timer: data.message_deletion_timer || 3600, // Default 1 hour
          max_members: data.max_members || 100,
        })
        .select()
        .single();

      if (groupError) {
        return { success: false, error: groupError.message };
      }

      // Automatically add the creator as admin member
      const { error: memberError } = await supabase
        .from('group_members')
        .insert({
          user_id: userId,
          group_id: newGroup.id,
          role: 'moderator', // Creator gets moderator role
        });

      if (memberError) {
        // Clean up the group if member addition fails
        await supabase.from('groups').delete().eq('id', newGroup.id);
        return { success: false, error: 'Failed to add creator to group' };
      }

      return { 
        success: true, 
        data: newGroup, 
        message: `Group "${newGroup.name}" created successfully! Access code: ${accessCode}` 
      };
    } catch (error: any) {
      console.error('Error creating group:', error);
      return { success: false, error: error.message || 'Failed to create group' };
    }
  }

  /**
   * Join a group using access code
   */
  static async joinGroup(data: JoinGroupData, userId: string): Promise<ApiResponse<Group>> {
    try {
      // Find the group by access code
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .select('*')
        .eq('access_code', data.access_code.toUpperCase())
        .eq('is_active', true)
        .single();

      if (groupError || !group) {
        return { success: false, error: 'Invalid access code or group not found' };
      }

      // Check if user is already a member
      const { data: existingMember, error: memberCheckError } = await supabase
        .from('group_members')
        .select('*')
        .eq('user_id', userId)
        .eq('group_id', group.id)
        .eq('is_active', true)
        .single();

      if (existingMember && !memberCheckError) {
        return { success: false, error: 'You are already a member of this group' };
      }

      // Check group member limit
      const { count: memberCount, error: countError } = await supabase
        .from('group_members')
        .select('*', { count: 'exact' })
        .eq('group_id', group.id)
        .eq('is_active', true);

      if (countError) {
        return { success: false, error: 'Failed to check group capacity' };
      }

      if (memberCount && memberCount >= group.max_members) {
        return { success: false, error: 'Group is at maximum capacity' };
      }

      // Add user to the group
      const { error: joinError } = await supabase
        .from('group_members')
        .insert({
          user_id: userId,
          group_id: group.id,
          role: 'member',
        });

      if (joinError) {
        return { success: false, error: joinError.message };
      }

      return { 
        success: true, 
        data: group, 
        message: `Successfully joined "${group.name}"!` 
      };
    } catch (error: any) {
      console.error('Error joining group:', error);
      return { success: false, error: error.message || 'Failed to join group' };
    }
  }

  /**
   * Leave a group
   */
  static async leaveGroup(groupId: string, userId: string): Promise<ApiResponse<void>> {
    try {
      // Check if user is the admin
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .select('admin_user_id')
        .eq('id', groupId)
        .single();

      if (groupError) {
        return { success: false, error: 'Group not found' };
      }

      if (group.admin_user_id === userId) {
        return { 
          success: false, 
          error: 'Group admin cannot leave. Transfer admin rights or delete the group.' 
        };
      }

      // Remove user from group
      const { error: leaveError } = await supabase
        .from('group_members')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('group_id', groupId);

      if (leaveError) {
        return { success: false, error: leaveError.message };
      }

      return { success: true, message: 'Successfully left the group' };
    } catch (error: any) {
      console.error('Error leaving group:', error);
      return { success: false, error: error.message || 'Failed to leave group' };
    }
  }

  /**
   * Get user's groups
   */
  static async getUserGroups(userId: string): Promise<ApiResponse<GroupWithDetails[]>> {
    try {
      const { data, error } = await supabase
        .from('group_members_with_details')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error) {
        return { success: false, error: error.message };
      }

      // Group the data by group_id and add member counts
      const groupsMap = new Map<string, GroupWithDetails>();
      
      for (const member of data || []) {
        if (!groupsMap.has(member.group_id)) {
          groupsMap.set(member.group_id, {
            id: member.group_id,
            name: member.group_name,
            description: '',
            access_code: member.access_code,
            admin_user_id: '',
            message_deletion_timer: 3600,
            max_members: 100,
            is_active: true,
            created_at: '',
            updated_at: '',
            member_count: 0,
            user_role: member.role as 'member' | 'moderator' | 'admin',
            members: [],
          });
        }
        
        const group = groupsMap.get(member.group_id)!;
        group.member_count++;
        group.members!.push({
          id: member.id,
          user_id: member.user_id,
          group_id: member.group_id,
          joined_at: member.joined_at,
          role: member.role as 'member' | 'moderator',
          is_active: member.is_active,
          username: member.username,
          display_name: member.display_name,
          user_role: member.user_role,
          group_name: member.group_name,
        });
      }

      const groups = Array.from(groupsMap.values());
      return { success: true, data: groups };
    } catch (error: any) {
      console.error('Error fetching user groups:', error);
      return { success: false, error: error.message || 'Failed to fetch groups' };
    }
  }

  /**
   * Get group details with members
   */
  static async getGroupDetails(groupId: string, userId: string): Promise<ApiResponse<GroupWithDetails>> {
    try {
      // Check if user is a member
      const { data: membership, error: memberError } = await supabase
        .from('group_members')
        .select('role')
        .eq('user_id', userId)
        .eq('group_id', groupId)
        .eq('is_active', true)
        .single();

      if (memberError || !membership) {
        return { success: false, error: 'You are not a member of this group' };
      }

      // Get group details
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .select('*')
        .eq('id', groupId)
        .single();

      if (groupError || !group) {
        return { success: false, error: 'Group not found' };
      }

      // Get all members
      const { data: members, error: membersError } = await supabase
        .from('group_members_with_details')
        .select('*')
        .eq('group_id', groupId)
        .eq('is_active', true);

      if (membersError) {
        return { success: false, error: 'Failed to fetch group members' };
      }

      const groupWithDetails: GroupWithDetails = {
        ...group,
        member_count: members?.length || 0,
        user_role: membership.role as 'member' | 'moderator' | 'admin',
        members: members?.map((member: any) => ({
          id: member.id,
          user_id: member.user_id,
          group_id: member.group_id,
          joined_at: member.joined_at,
          role: member.role as 'member' | 'moderator',
          is_active: member.is_active,
          username: member.username,
          display_name: member.display_name,
          user_role: member.user_role,
          group_name: member.group_name,
        })) || [],
      };

      return { success: true, data: groupWithDetails };
    } catch (error: any) {
      console.error('Error fetching group details:', error);
      return { success: false, error: error.message || 'Failed to fetch group details' };
    }
  }

  /**
   * Update group settings (admin only)
   */
  static async updateGroup(
    groupId: string, 
    updates: Partial<Group>, 
    userId: string
  ): Promise<ApiResponse<Group>> {
    try {
      // Check if user is admin
      const { data: group, error: checkError } = await supabase
        .from('groups')
        .select('admin_user_id')
        .eq('id', groupId)
        .single();

      if (checkError || !group) {
        return { success: false, error: 'Group not found' };
      }

      if (group.admin_user_id !== userId) {
        return { success: false, error: 'Only group admin can update settings' };
      }

      // Update the group
      const { data: updatedGroup, error: updateError } = await supabase
        .from('groups')
        .update({ 
          ...updates, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', groupId)
        .select()
        .single();

      if (updateError) {
        return { success: false, error: updateError.message };
      }

      return { success: true, data: updatedGroup, message: 'Group updated successfully' };
    } catch (error: any) {
      console.error('Error updating group:', error);
      return { success: false, error: error.message || 'Failed to update group' };
    }
  }

  /**
   * Delete group (admin only)
   */
  static async deleteGroup(groupId: string, userId: string): Promise<ApiResponse<void>> {
    try {
      // Check if user is admin
      const { data: group, error: checkError } = await supabase
        .from('groups')
        .select('admin_user_id, name')
        .eq('id', groupId)
        .single();

      if (checkError || !group) {
        return { success: false, error: 'Group not found' };
      }

      if (group.admin_user_id !== userId) {
        return { success: false, error: 'Only group admin can delete the group' };
      }

      // Soft delete - mark as inactive
      const { error: deleteError } = await supabase
        .from('groups')
        .update({ is_active: false })
        .eq('id', groupId);

      if (deleteError) {
        return { success: false, error: deleteError.message };
      }

      return { success: true, message: `Group "${group.name}" deleted successfully` };
    } catch (error: any) {
      console.error('Error deleting group:', error);
      return { success: false, error: error.message || 'Failed to delete group' };
    }
  }

  /**
   * Remove member from group (admin/moderator only)
   */
  static async removeMember(
    groupId: string, 
    memberUserId: string, 
    adminUserId: string
  ): Promise<ApiResponse<void>> {
    try {
      // Check admin permissions
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .select('admin_user_id')
        .eq('id', groupId)
        .single();

      if (groupError || !group) {
        return { success: false, error: 'Group not found' };
      }

      // Check if requester is admin or moderator
      const { data: requesterMembership, error: requesterError } = await supabase
        .from('group_members')
        .select('role')
        .eq('user_id', adminUserId)
        .eq('group_id', groupId)
        .eq('is_active', true)
        .single();

      if (requesterError || !requesterMembership) {
        return { success: false, error: 'You are not a member of this group' };
      }

      const isAdmin = group.admin_user_id === adminUserId;
      const isModerator = requesterMembership.role === 'moderator';

      if (!isAdmin && !isModerator) {
        return { success: false, error: 'Only admins and moderators can remove members' };
      }

      // Cannot remove the admin
      if (memberUserId === group.admin_user_id) {
        return { success: false, error: 'Cannot remove group admin' };
      }

      // Remove the member
      const { error: removeError } = await supabase
        .from('group_members')
        .update({ is_active: false })
        .eq('user_id', memberUserId)
        .eq('group_id', groupId);

      if (removeError) {
        return { success: false, error: removeError.message };
      }

      return { success: true, message: 'Member removed successfully' };
    } catch (error: any) {
      console.error('Error removing member:', error);
      return { success: false, error: error.message || 'Failed to remove member' };
    }
  }
}

export default GroupService;