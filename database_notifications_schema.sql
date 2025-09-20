-- OpenChat V2 Notifications Schema
-- Real-time notification system for group management and user interactions

-- Create notification types enum
CREATE TYPE notification_type AS ENUM (
    'group_join_request',
    'group_join_approved', 
    'group_join_denied',
    'group_member_removed',
    'group_admin_changed',
    'group_deleted',
    'group_settings_updated',
    'message_mention',
    'system_announcement'
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    recipient_id UUID NOT NULL REFERENCES users_v2(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users_v2(id) ON DELETE SET NULL, -- NULL for system notifications
    notification_type notification_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB, -- Additional structured data (group_id, access_code, etc.)
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'), -- Auto-expire after 7 days
    
    -- Indexes for performance
    CONSTRAINT valid_expiration CHECK (expires_at > created_at)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_notifications_expires_at ON notifications(expires_at);

-- Enable Row Level Security (RLS)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notifications
CREATE POLICY "Users can view their own notifications" ON notifications
    FOR SELECT USING (recipient_id = auth.uid());

CREATE POLICY "Users can update their own notifications" ON notifications
    FOR UPDATE USING (recipient_id = auth.uid());

CREATE POLICY "System can insert notifications" ON notifications
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can delete their own notifications" ON notifications
    FOR DELETE USING (recipient_id = auth.uid());

-- Create group join requests table for pending requests
CREATE TABLE IF NOT EXISTS group_join_requests (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users_v2(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    message TEXT, -- Optional message from user requesting to join
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'denied'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    processed_by UUID REFERENCES users_v2(id) ON DELETE SET NULL,
    
    -- Unique constraint to prevent duplicate requests
    UNIQUE(user_id, group_id),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'denied'))
);

-- Create indexes for group join requests
CREATE INDEX IF NOT EXISTS idx_group_join_requests_user_id ON group_join_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_group_join_requests_group_id ON group_join_requests(group_id);
CREATE INDEX IF NOT EXISTS idx_group_join_requests_status ON group_join_requests(status);
CREATE INDEX IF NOT EXISTS idx_group_join_requests_created_at ON group_join_requests(created_at DESC);

-- Enable RLS for group join requests
ALTER TABLE group_join_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for group join requests
CREATE POLICY "Users can view requests for their groups" ON group_join_requests
    FOR SELECT USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM groups g 
            WHERE g.id = group_id AND g.admin_user_id = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM users_v2 
            WHERE users_v2.id = auth.uid() AND users_v2.role IN ('admin', 'operator')
        )
    );

CREATE POLICY "Users can create join requests" ON group_join_requests
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Group admins can update requests" ON group_join_requests
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM groups g 
            WHERE g.id = group_id AND g.admin_user_id = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM users_v2 
            WHERE users_v2.id = auth.uid() AND users_v2.role IN ('admin', 'operator')
        )
    );

-- Function to create notification
CREATE OR REPLACE FUNCTION create_notification(
    p_recipient_id UUID,
    p_sender_id UUID DEFAULT NULL,
    p_notification_type notification_type,
    p_title VARCHAR(255),
    p_message TEXT,
    p_data JSONB DEFAULT NULL,
    p_expires_days INTEGER DEFAULT 7
)
RETURNS UUID AS $$
DECLARE
    notification_id UUID;
BEGIN
    INSERT INTO notifications (
        recipient_id,
        sender_id,
        notification_type,
        title,
        message,
        data,
        expires_at
    ) VALUES (
        p_recipient_id,
        p_sender_id,
        p_notification_type,
        p_title,
        p_message,
        p_data,
        NOW() + (p_expires_days || ' days')::INTERVAL
    ) RETURNING id INTO notification_id;
    
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to request to join a group
CREATE OR REPLACE FUNCTION request_join_group(
    p_user_id UUID,
    p_group_id UUID,
    p_message TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    request_id UUID;
    group_data RECORD;
    user_data RECORD;
    notification_id UUID;
BEGIN
    -- Get group data
    SELECT name, admin_user_id INTO group_data
    FROM groups 
    WHERE id = p_group_id AND is_active = true;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Group not found or inactive';
    END IF;
    
    -- Get user data
    SELECT username, display_name INTO user_data
    FROM users_v2 
    WHERE id = p_user_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    
    -- Check if user is already a member
    IF EXISTS (
        SELECT 1 FROM group_members 
        WHERE user_id = p_user_id AND group_id = p_group_id AND is_active = true
    ) THEN
        RAISE EXCEPTION 'User is already a member of this group';
    END IF;
    
    -- Create join request
    INSERT INTO group_join_requests (
        user_id,
        group_id,
        message
    ) VALUES (
        p_user_id,
        p_group_id,
        p_message
    ) RETURNING id INTO request_id;
    
    -- Create notification for group admin
    notification_id := create_notification(
        group_data.admin_user_id,
        p_user_id,
        'group_join_request',
        'New Join Request',
        format('%s wants to join "%s"', 
               COALESCE(user_data.display_name, user_data.username), 
               group_data.name),
        jsonb_build_object(
            'group_id', p_group_id,
            'group_name', group_data.name,
            'request_id', request_id,
            'user_message', p_message
        )
    );
    
    RETURN request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to approve/deny join request
CREATE OR REPLACE FUNCTION process_join_request(
    p_request_id UUID,
    p_admin_id UUID,
    p_approved BOOLEAN,
    p_admin_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    request_data RECORD;
    group_data RECORD;
    user_data RECORD;
    admin_data RECORD;
    notification_id UUID;
BEGIN
    -- Get request data
    SELECT user_id, group_id, status INTO request_data
    FROM group_join_requests 
    WHERE id = p_request_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Join request not found';
    END IF;
    
    IF request_data.status != 'pending' THEN
        RAISE EXCEPTION 'Join request has already been processed';
    END IF;
    
    -- Get group data and verify admin permissions
    SELECT name, admin_user_id INTO group_data
    FROM groups 
    WHERE id = request_data.group_id AND is_active = true;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Group not found or inactive';
    END IF;
    
    IF group_data.admin_user_id != p_admin_id AND NOT EXISTS (
        SELECT 1 FROM users_v2 
        WHERE id = p_admin_id AND role IN ('admin', 'operator')
    ) THEN
        RAISE EXCEPTION 'Only group admin or system admin can process join requests';
    END IF;
    
    -- Get user and admin data for notifications
    SELECT username, display_name INTO user_data
    FROM users_v2 WHERE id = request_data.user_id;
    
    SELECT username, display_name INTO admin_data
    FROM users_v2 WHERE id = p_admin_id;
    
    -- Update request status
    UPDATE group_join_requests 
    SET 
        status = CASE WHEN p_approved THEN 'approved' ELSE 'denied' END,
        processed_at = NOW(),
        processed_by = p_admin_id
    WHERE id = p_request_id;
    
    IF p_approved THEN
        -- Add user to group
        INSERT INTO group_members (user_id, group_id, role)
        VALUES (request_data.user_id, request_data.group_id, 'member');
        
        -- Create approval notification
        notification_id := create_notification(
            request_data.user_id,
            p_admin_id,
            'group_join_approved',
            'Join Request Approved',
            format('Your request to join "%s" has been approved!', group_data.name),
            jsonb_build_object(
                'group_id', request_data.group_id,
                'group_name', group_data.name,
                'admin_message', p_admin_message
            )
        );
    ELSE
        -- Create denial notification
        notification_id := create_notification(
            request_data.user_id,
            p_admin_id,
            'group_join_denied',
            'Join Request Denied',
            format('Your request to join "%s" has been denied', group_data.name),
            jsonb_build_object(
                'group_id', request_data.group_id,
                'group_name', group_data.name,
                'admin_message', p_admin_message
            )
        );
    END IF;
    
    RETURN p_approved;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(
    p_notification_id UUID,
    p_user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE notifications 
    SET is_read = true
    WHERE id = p_notification_id AND recipient_id = p_user_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup expired notifications
CREATE OR REPLACE FUNCTION cleanup_expired_notifications()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM notifications 
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for real-time notification triggers
CREATE OR REPLACE FUNCTION notify_notification_change()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('notification_changes', json_build_object(
        'type', TG_OP,
        'record', row_to_json(NEW),
        'old_record', row_to_json(OLD)
    )::text);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for real-time notifications
DROP TRIGGER IF EXISTS notifications_notify_trigger ON notifications;
CREATE TRIGGER notifications_notify_trigger
    AFTER INSERT OR UPDATE OR DELETE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION notify_notification_change();

-- Grant permissions
GRANT ALL ON notifications TO anon, authenticated;
GRANT ALL ON group_join_requests TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_notification(UUID, UUID, notification_type, VARCHAR, TEXT, JSONB, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION request_join_group(UUID, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION process_join_request(UUID, UUID, BOOLEAN, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mark_notification_read(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_notifications() TO anon, authenticated;

-- Comments for documentation
COMMENT ON TABLE notifications IS 'Real-time notification system for user interactions';
COMMENT ON TABLE group_join_requests IS 'Pending group join requests requiring admin approval';
COMMENT ON FUNCTION create_notification(UUID, UUID, notification_type, VARCHAR, TEXT, JSONB, INTEGER) IS 'Create a new notification for a user';
COMMENT ON FUNCTION request_join_group(UUID, UUID, TEXT) IS 'Request to join a group with admin approval';
COMMENT ON FUNCTION process_join_request(UUID, UUID, BOOLEAN, TEXT) IS 'Approve or deny a group join request';
COMMENT ON FUNCTION mark_notification_read(UUID, UUID) IS 'Mark a notification as read';
COMMENT ON FUNCTION cleanup_expired_notifications() IS 'Remove expired notifications automatically';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'OpenChat V2 Notifications Schema completed successfully!';
    RAISE NOTICE 'New tables: notifications, group_join_requests';
    RAISE NOTICE 'New functions: create_notification, request_join_group, process_join_request';
    RAISE NOTICE 'Real-time triggers and RLS policies configured';
    RAISE NOTICE 'Group join approval workflow implemented';
END $$;