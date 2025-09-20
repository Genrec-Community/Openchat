-- OpenChat V2 Messages Table Addition
-- TTL-based persistent messaging with pinned message support
-- This extends the existing V2 schema with the messages infrastructure

-- Create messages_v2 table with TTL and pinned message support
CREATE TABLE IF NOT EXISTS messages_v2 (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users_v2(id) ON DELETE CASCADE,
    username VARCHAR(50) NOT NULL,
    display_name VARCHAR(100),
    content TEXT NOT NULL,
    message_type VARCHAR(20) NOT NULL DEFAULT 'direct', -- 'direct' or 'group'
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE, -- NULL for direct messages
    user_role user_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL, -- TTL for message expiration
    is_pinned BOOLEAN DEFAULT FALSE, -- Pinned messages (Operator-only)
    
    -- Constraints
    CONSTRAINT valid_message_type CHECK (message_type IN ('direct', 'group')),
    CONSTRAINT valid_group_message CHECK (
        (message_type = 'direct' AND group_id IS NULL) OR 
        (message_type = 'group' AND group_id IS NOT NULL)
    ),
    CONSTRAINT valid_pinned_message CHECK (
        (is_pinned = FALSE) OR 
        (is_pinned = TRUE AND user_role = 'operator')
    )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_v2_created_at ON messages_v2(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_v2_expires_at ON messages_v2(expires_at);
CREATE INDEX IF NOT EXISTS idx_messages_v2_user_id ON messages_v2(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_v2_message_type ON messages_v2(message_type);
CREATE INDEX IF NOT EXISTS idx_messages_v2_group_id ON messages_v2(group_id);
CREATE INDEX IF NOT EXISTS idx_messages_v2_is_pinned ON messages_v2(is_pinned);
CREATE INDEX IF NOT EXISTS idx_messages_v2_user_role ON messages_v2(user_role);

-- Create app_settings table for system-wide configuration
CREATE TABLE IF NOT EXISTS app_settings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES users_v2(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default settings
INSERT INTO app_settings (setting_key, setting_value, description) VALUES
('default_message_retention_hours', '24', 'Default message retention time in hours for direct chat'),
('guest_session_hours', '24', 'Guest session duration in hours'),
('max_message_length', '1000', 'Maximum message content length'),
('cleanup_interval_minutes', '60', 'How often to run automated cleanup in minutes')
ON CONFLICT (setting_key) DO NOTHING;

-- Enable Row Level Security (RLS)
ALTER TABLE messages_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for messages_v2
CREATE POLICY "Anyone can view active messages" ON messages_v2
    FOR SELECT USING (expires_at > NOW());

CREATE POLICY "Authenticated users can insert messages" ON messages_v2
    FOR INSERT WITH CHECK (
        -- Users can only insert messages with their own user_id
        user_id = auth.uid() OR
        -- Or if they are a guest with valid session
        EXISTS (
            SELECT 1 FROM users_v2 
            WHERE users_v2.id = user_id 
            AND users_v2.role = 'guest'
        )
    );

CREATE POLICY "Users can delete their own messages" ON messages_v2
    FOR DELETE USING (
        user_id = auth.uid() OR
        -- Operators can delete any message
        EXISTS (
            SELECT 1 FROM users_v2 
            WHERE users_v2.id = auth.uid() AND users_v2.role = 'operator'
        )
    );

CREATE POLICY "Only operators can update messages (for pinning)" ON messages_v2
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users_v2 
            WHERE users_v2.id = auth.uid() AND users_v2.role = 'operator'
        )
    );

-- RLS Policies for app_settings
CREATE POLICY "Anyone can view app settings" ON app_settings
    FOR SELECT USING (true);

CREATE POLICY "Only operators can modify app settings" ON app_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users_v2 
            WHERE users_v2.id = auth.uid() AND users_v2.role = 'operator'
        )
    );

-- Function to calculate TTL based on context
CREATE OR REPLACE FUNCTION calculate_message_ttl(
    p_message_type VARCHAR(20),
    p_group_id UUID DEFAULT NULL,
    p_custom_retention_hours INTEGER DEFAULT NULL
)
RETURNS TIMESTAMP WITH TIME ZONE AS $$
DECLARE
    retention_hours INTEGER;
    ttl_timestamp TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Use custom retention if provided
    IF p_custom_retention_hours IS NOT NULL THEN
        retention_hours := p_custom_retention_hours;
    ELSIF p_message_type = 'group' AND p_group_id IS NOT NULL THEN
        -- Get group's message deletion timer
        SELECT (message_deletion_timer / 3600) INTO retention_hours
        FROM groups 
        WHERE id = p_group_id AND is_active = true;
        
        -- Fallback to default if group not found
        IF retention_hours IS NULL THEN
            retention_hours := 24;
        END IF;
    ELSE
        -- Direct messages use default setting
        SELECT setting_value::INTEGER INTO retention_hours
        FROM app_settings 
        WHERE setting_key = 'default_message_retention_hours';
        
        -- Fallback to 24 hours if setting not found
        IF retention_hours IS NULL THEN
            retention_hours := 24;
        END IF;
    END IF;
    
    -- Calculate TTL timestamp
    ttl_timestamp := NOW() + (retention_hours || ' hours')::INTERVAL;
    
    RETURN ttl_timestamp;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to send message with automatic TTL calculation (guest-compatible)
CREATE OR REPLACE FUNCTION send_message_v2_guest(
    p_user_id UUID,
    p_content TEXT,
    p_message_type VARCHAR(20) DEFAULT 'direct',
    p_group_id UUID DEFAULT NULL,
    p_custom_retention_hours INTEGER DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    message_id UUID;
    user_data RECORD;
    ttl_timestamp TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get user data
    SELECT username, display_name, role INTO user_data
    FROM users_v2 
    WHERE id = p_user_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    
    -- Calculate TTL
    ttl_timestamp := calculate_message_ttl(p_message_type, p_group_id, p_custom_retention_hours);
    
    -- Insert message
    INSERT INTO messages_v2 (
        user_id,
        username,
        display_name,
        content,
        message_type,
        group_id,
        user_role,
        expires_at
    ) VALUES (
        p_user_id,
        user_data.username,
        user_data.display_name,
        p_content,
        p_message_type,
        p_group_id,
        user_data.role,
        ttl_timestamp
    ) RETURNING id INTO message_id;
    
    -- Update user's last_active
    UPDATE users_v2 
    SET last_active = NOW(), is_online = true 
    WHERE id = p_user_id;
    
    RETURN message_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to pin/unpin messages (Operator only)
CREATE OR REPLACE FUNCTION toggle_message_pin(
    p_message_id UUID,
    p_operator_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    current_pin_status BOOLEAN;
    operator_role user_role;
BEGIN
    -- Verify operator permissions
    SELECT role INTO operator_role
    FROM users_v2 
    WHERE id = p_operator_id;
    
    IF operator_role != 'operator' THEN
        RAISE EXCEPTION 'Only operators can pin/unpin messages';
    END IF;
    
    -- Get current pin status
    SELECT is_pinned INTO current_pin_status
    FROM messages_v2 
    WHERE id = p_message_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Message not found';
    END IF;
    
    -- Toggle pin status
    UPDATE messages_v2 
    SET is_pinned = NOT current_pin_status
    WHERE id = p_message_id;
    
    RETURN NOT current_pin_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for automated message cleanup
CREATE OR REPLACE FUNCTION cleanup_expired_messages()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete expired non-pinned messages
    DELETE FROM messages_v2 
    WHERE expires_at < NOW() AND is_pinned = FALSE;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get message retention hours
CREATE OR REPLACE FUNCTION get_message_retention_hours()
RETURNS INTEGER AS $$
DECLARE
    retention_hours INTEGER;
BEGIN
    SELECT setting_value::INTEGER INTO retention_hours
    FROM app_settings 
    WHERE setting_key = 'default_message_retention_hours';
    
    RETURN COALESCE(retention_hours, 24);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create OAuth user (for Google Auth compatibility)
CREATE OR REPLACE FUNCTION create_oauth_user(
    user_id UUID,
    user_email VARCHAR(255),
    user_username VARCHAR(50),
    user_display_name VARCHAR(100),
    user_role user_role DEFAULT 'normal'
)
RETURNS UUID AS $$
BEGIN
    INSERT INTO users_v2 (
        id,
        email,
        username,
        display_name,
        role,
        theme,
        is_online,
        last_active,
        created_at
    ) VALUES (
        user_id,
        user_email,
        user_username,
        user_display_name,
        user_role,
        'light',
        true,
        NOW(),
        NOW()
    );
    
    RETURN user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle real-time subscriptions
CREATE OR REPLACE FUNCTION notify_message_change()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('message_changes_v2', json_build_object(
        'type', TG_OP,
        'record', row_to_json(NEW),
        'old_record', row_to_json(OLD)
    )::text);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for real-time notifications
DROP TRIGGER IF EXISTS messages_v2_notify_trigger ON messages_v2;
CREATE TRIGGER messages_v2_notify_trigger
    AFTER INSERT OR UPDATE OR DELETE ON messages_v2
    FOR EACH ROW
    EXECUTE FUNCTION notify_message_change();

-- Create trigger to automatically update user last_active
CREATE OR REPLACE FUNCTION update_user_last_active_v2()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE users_v2 
    SET last_active = NOW(), is_online = true 
    WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS update_user_last_active_v2_trigger ON messages_v2;
CREATE TRIGGER update_user_last_active_v2_trigger
    AFTER INSERT ON messages_v2
    FOR EACH ROW
    EXECUTE FUNCTION update_user_last_active_v2();

-- Grant permissions
GRANT ALL ON messages_v2 TO anon, authenticated;
GRANT ALL ON app_settings TO anon, authenticated;
GRANT EXECUTE ON FUNCTION send_message_v2_guest(UUID, TEXT, VARCHAR, UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION toggle_message_pin(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_messages() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_message_retention_hours() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_oauth_user(UUID, VARCHAR, VARCHAR, VARCHAR, user_role) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION calculate_message_ttl(VARCHAR, UUID, INTEGER) TO anon, authenticated;

-- Comments for documentation
COMMENT ON TABLE messages_v2 IS 'Enhanced messages table with TTL-based persistence and pinned message support';
COMMENT ON TABLE app_settings IS 'System-wide configuration settings';
COMMENT ON FUNCTION send_message_v2_guest(UUID, TEXT, VARCHAR, UUID, INTEGER) IS 'Send message with automatic TTL calculation (guest-compatible)';
COMMENT ON FUNCTION toggle_message_pin(UUID, UUID) IS 'Pin/unpin messages (Operator only)';
COMMENT ON FUNCTION cleanup_expired_messages() IS 'Automated cleanup of expired non-pinned messages';
COMMENT ON FUNCTION create_oauth_user(UUID, VARCHAR, VARCHAR, VARCHAR, user_role) IS 'Create user for OAuth flows with proper permissions';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'OpenChat V2 Messages Infrastructure completed successfully!';
    RAISE NOTICE 'New table: messages_v2 with TTL and pinned message support';
    RAISE NOTICE 'New table: app_settings for system configuration';
    RAISE NOTICE 'Functions: send_message_v2_guest, toggle_message_pin, cleanup_expired_messages';
    RAISE NOTICE 'Real-time triggers and RLS policies configured';
    RAISE NOTICE 'TTL-based message persistence with automatic cleanup implemented';
END $$;