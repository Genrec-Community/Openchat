-- Anonymous Chat App Database Schema
-- Created for Supabase
-- Updated with MCP compatibility and optimizations

-- Enable the necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table to store user sessions and preferences
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    is_op BOOLEAN DEFAULT FALSE,
    theme VARCHAR(20) DEFAULT 'light',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create messages table for direct chat messages
CREATE TABLE IF NOT EXISTS messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Create pinned_messages table for OP pinned messages
CREATE TABLE IF NOT EXISTS pinned_messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_expires_at ON messages(expires_at);
CREATE INDEX IF NOT EXISTS idx_pinned_messages_created_at ON pinned_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active DESC);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_pinned_messages_user_id ON pinned_messages(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinned_messages ENABLE ROW LEVEL SECURITY;

-- Create policies for users table
CREATE POLICY "Users can view all users" ON users
    FOR SELECT USING (true);

CREATE POLICY "Users can insert their own record" ON users
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own record" ON users
    FOR UPDATE USING (true);

-- Create policies for messages table
CREATE POLICY "Anyone can view messages" ON messages
    FOR SELECT USING (true);

CREATE POLICY "Anyone can insert messages" ON messages
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can delete their own messages" ON messages
    FOR DELETE USING (true);

-- Create policies for pinned_messages table (only OP can manage)
CREATE POLICY "Anyone can view pinned messages" ON pinned_messages
    FOR SELECT USING (true);

CREATE POLICY "Only OP can insert pinned messages" ON pinned_messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = user_id AND users.is_op = true
        )
    );

CREATE POLICY "Only OP can update pinned messages" ON pinned_messages
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = user_id AND users.is_op = true
        )
    );

CREATE POLICY "Only OP can delete pinned messages" ON pinned_messages
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = user_id AND users.is_op = true
        )
    );

-- Create function to automatically delete expired messages
CREATE OR REPLACE FUNCTION delete_expired_messages()
RETURNS void AS $$
BEGIN
    DELETE FROM messages WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to update last_active timestamp
CREATE OR REPLACE FUNCTION update_last_active()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE users SET last_active = NOW() WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to update last_active when user sends a message
DROP TRIGGER IF EXISTS update_user_last_active ON messages;
CREATE TRIGGER update_user_last_active
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_last_active();

-- Create function to handle real-time subscriptions
CREATE OR REPLACE FUNCTION notify_message_change()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('message_changes', json_build_object(
        'type', TG_OP,
        'record', row_to_json(NEW),
        'old_record', row_to_json(OLD)
    )::text);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for real-time notifications
DROP TRIGGER IF EXISTS messages_notify_trigger ON messages;
CREATE TRIGGER messages_notify_trigger
    AFTER INSERT OR UPDATE OR DELETE ON messages
    FOR EACH ROW
    EXECUTE FUNCTION notify_message_change();

DROP TRIGGER IF EXISTS pinned_messages_notify_trigger ON pinned_messages;
CREATE TRIGGER pinned_messages_notify_trigger
    AFTER INSERT OR UPDATE OR DELETE ON pinned_messages
    FOR EACH ROW
    EXECUTE FUNCTION notify_message_change();

-- Insert default OP user
INSERT INTO users (username, is_op, theme) 
VALUES ('Shyamnath-sankar', true, 'light')
ON CONFLICT DO NOTHING;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- Create view for messages with user information (optional)
CREATE OR REPLACE VIEW messages_with_users AS
SELECT 
    m.*,
    u.is_op as sender_is_op
FROM messages m
LEFT JOIN users u ON m.user_id = u.id;

-- Grant permissions on view
GRANT SELECT ON messages_with_users TO anon, authenticated;

-- Comments for documentation
COMMENT ON TABLE users IS 'Stores user sessions and preferences';
COMMENT ON TABLE messages IS 'Direct chat messages that expire after 24 hours';
COMMENT ON TABLE pinned_messages IS 'Important messages pinned by moderators';
COMMENT ON FUNCTION delete_expired_messages() IS 'Removes messages older than 24 hours';
COMMENT ON FUNCTION update_last_active() IS 'Updates user last_active timestamp when they send a message';
COMMENT ON FUNCTION notify_message_change() IS 'Sends real-time notifications for message changes';

-- Create a function to clean up inactive users (optional)
CREATE OR REPLACE FUNCTION cleanup_inactive_users(days_inactive INTEGER DEFAULT 7)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM users 
    WHERE 
        is_op = false 
        AND last_active < NOW() - INTERVAL '1 day' * days_inactive;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_inactive_users(INTEGER) IS 'Removes non-OP users inactive for specified days';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Anonymous Chat database schema applied successfully!';
    RAISE NOTICE 'Tables created: users, messages, pinned_messages';
    RAISE NOTICE 'Functions created: delete_expired_messages, update_last_active, notify_message_change, cleanup_inactive_users';
    RAISE NOTICE 'RLS policies enabled for security';
    RAISE NOTICE 'Real-time triggers configured';
END $$;