-- OpenChat V2 Database Schema Migration
-- Refactored architecture with roles and groups
-- Migration from V1 to V2

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Backup existing data before migration (optional)
-- CREATE TABLE users_backup AS SELECT * FROM users;
-- CREATE TABLE messages_backup AS SELECT * FROM messages;

-- Drop existing tables (comment out if you want to preserve data)
-- DROP TABLE IF EXISTS pinned_messages CASCADE;
-- DROP TABLE IF EXISTS messages CASCADE;

-- Create ENUM types for better type safety
CREATE TYPE user_role AS ENUM ('guest', 'normal', 'admin', 'operator');

-- Create new users table with roles and auto-generated usernames
CREATE TABLE IF NOT EXISTS users_v2 (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email VARCHAR(255) UNIQUE, -- Only for normal/admin/operator users
    username VARCHAR(50) NOT NULL UNIQUE, -- Auto-generated Reddit-style username
    role user_role NOT NULL DEFAULT 'guest',
    display_name VARCHAR(100), -- Optional display name
    theme VARCHAR(20) DEFAULT 'light',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_online BOOLEAN DEFAULT FALSE,
    session_token VARCHAR(255), -- For guest users
    
    -- Constraints
    CONSTRAINT valid_email_for_role CHECK (
        (role = 'guest' AND email IS NULL) OR 
        (role != 'guest' AND email IS NOT NULL)
    )
);

-- Create groups table
CREATE TABLE IF NOT EXISTS groups (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    access_code VARCHAR(20) NOT NULL UNIQUE, -- Unguessable access code
    admin_user_id UUID NOT NULL REFERENCES users_v2(id) ON DELETE CASCADE,
    message_deletion_timer INTEGER DEFAULT 3600, -- Seconds (default 1 hour)
    max_members INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create group_members junction table
CREATE TABLE IF NOT EXISTS group_members (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users_v2(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    role VARCHAR(20) DEFAULT 'member', -- member, moderator
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Unique constraint to prevent duplicate memberships
    UNIQUE(user_id, group_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_v2_email ON users_v2(email);
CREATE INDEX IF NOT EXISTS idx_users_v2_username ON users_v2(username);
CREATE INDEX IF NOT EXISTS idx_users_v2_role ON users_v2(role);
CREATE INDEX IF NOT EXISTS idx_users_v2_last_active ON users_v2(last_active DESC);
CREATE INDEX IF NOT EXISTS idx_users_v2_session_token ON users_v2(session_token);

CREATE INDEX IF NOT EXISTS idx_groups_access_code ON groups(access_code);
CREATE INDEX IF NOT EXISTS idx_groups_admin_user_id ON groups(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_groups_is_active ON groups(is_active);

CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_active ON group_members(is_active);

-- Enable Row Level Security (RLS)
ALTER TABLE users_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users_v2
CREATE POLICY "Users can view all active users" ON users_v2
    FOR SELECT USING (true);

CREATE POLICY "Users can insert their own record" ON users_v2
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own record" ON users_v2
    FOR UPDATE USING (id = auth.uid() OR role = 'operator');

CREATE POLICY "Only operators can delete users" ON users_v2
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM users_v2 
            WHERE users_v2.id = auth.uid() AND users_v2.role = 'operator'
        )
    );

-- RLS Policies for groups
CREATE POLICY "Anyone can view active groups" ON groups
    FOR SELECT USING (is_active = true);

CREATE POLICY "Normal+ users can create groups" ON groups
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users_v2 
            WHERE users_v2.id = auth.uid() 
            AND users_v2.role IN ('normal', 'admin', 'operator')
        )
    );

CREATE POLICY "Admins and operators can update groups" ON groups
    FOR UPDATE USING (
        admin_user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users_v2 
            WHERE users_v2.id = auth.uid() AND users_v2.role IN ('admin', 'operator')
        )
    );

CREATE POLICY "Admins and operators can delete groups" ON groups
    FOR DELETE USING (
        admin_user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users_v2 
            WHERE users_v2.id = auth.uid() AND users_v2.role IN ('admin', 'operator')
        )
    );

-- RLS Policies for group_members
CREATE POLICY "Users can view group memberships" ON group_members
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

CREATE POLICY "Users can join groups" ON group_members
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can leave groups or admins can remove members" ON group_members
    FOR DELETE USING (
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

-- Functions for username generation
CREATE OR REPLACE FUNCTION generate_reddit_style_username()
RETURNS TEXT AS $$
DECLARE
    adjectives TEXT[] := ARRAY[
        'Quick', 'Bright', 'Silent', 'Swift', 'Bold', 'Calm', 'Wise', 'Kind',
        'Sharp', 'Cool', 'Smart', 'Fast', 'Smooth', 'Clear', 'Strong', 'Light',
        'Fresh', 'Clean', 'Pure', 'Deep', 'True', 'Real', 'Fair', 'Free'
    ];
    nouns TEXT[] := ARRAY[
        'Tiger', 'Eagle', 'Wolf', 'Fox', 'Lion', 'Bear', 'Hawk', 'Cat',
        'Dog', 'Bird', 'Fish', 'Star', 'Moon', 'Sun', 'Rock', 'Tree',
        'River', 'Ocean', 'Wind', 'Fire', 'Ice', 'Snow', 'Rain', 'Storm'
    ];
    adj TEXT;
    noun TEXT;
    number INTEGER;
    username TEXT;
    counter INTEGER := 0;
BEGIN
    LOOP
        -- Select random adjective and noun
        adj := adjectives[1 + floor(random() * array_length(adjectives, 1))];
        noun := nouns[1 + floor(random() * array_length(nouns, 1))];
        number := floor(random() * 9999);
        
        -- Combine to create username
        username := adj || noun || number::TEXT;
        
        -- Check if username already exists
        IF NOT EXISTS (SELECT 1 FROM users_v2 WHERE users_v2.username = username) THEN
            RETURN username;
        END IF;
        
        -- Prevent infinite loop
        counter := counter + 1;
        IF counter > 100 THEN
            -- Fallback to UUID-based username
            RETURN 'User' || substring(uuid_generate_v4()::TEXT from 1 for 8);
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate access codes
CREATE OR REPLACE FUNCTION generate_access_code()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    code TEXT := '';
    i INTEGER;
    counter INTEGER := 0;
BEGIN
    LOOP
        code := '';
        -- Generate 8-character code
        FOR i IN 1..8 LOOP
            code := code || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
        END LOOP;
        
        -- Check if code already exists
        IF NOT EXISTS (SELECT 1 FROM groups WHERE access_code = code) THEN
            RETURN code;
        END IF;
        
        -- Prevent infinite loop
        counter := counter + 1;
        IF counter > 100 THEN
            -- Fallback to UUID-based code
            RETURN upper(substring(uuid_generate_v4()::TEXT from 1 for 8));
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update last_active timestamp
CREATE OR REPLACE FUNCTION update_user_last_active()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE users_v2 
    SET last_active = NOW(), is_online = true 
    WHERE id = auth.uid();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up inactive guest users
CREATE OR REPLACE FUNCTION cleanup_inactive_guests(hours_inactive INTEGER DEFAULT 24)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM users_v2 
    WHERE 
        role = 'guest' 
        AND last_active < NOW() - INTERVAL '1 hour' * hours_inactive;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create views for easier querying
CREATE OR REPLACE VIEW group_members_with_details AS
SELECT 
    gm.*,
    u.username,
    u.display_name,
    u.role as user_role,
    g.name as group_name,
    g.access_code
FROM group_members gm
JOIN users_v2 u ON gm.user_id = u.id
JOIN groups g ON gm.group_id = g.id
WHERE gm.is_active = true AND g.is_active = true;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
GRANT SELECT ON group_members_with_details TO anon, authenticated;

-- Insert default operator user
INSERT INTO users_v2 (username, email, role, display_name, theme) 
VALUES ('OperatorAdmin', 'admin@openchat.com', 'operator', 'System Administrator', 'light')
ON CONFLICT (username) DO NOTHING;

-- Disable the old messages table by renaming it
ALTER TABLE IF EXISTS messages RENAME TO messages_deprecated;
ALTER TABLE IF EXISTS pinned_messages RENAME TO pinned_messages_deprecated;

-- Comments for documentation
COMMENT ON TABLE users_v2 IS 'Enhanced users table with role-based access and auto-generated usernames';
COMMENT ON TABLE groups IS 'Chat groups with access codes and admin management';
COMMENT ON TABLE group_members IS 'Junction table managing group memberships';
COMMENT ON FUNCTION generate_reddit_style_username() IS 'Generates unique Reddit-style usernames';
COMMENT ON FUNCTION generate_access_code() IS 'Generates unique 8-character group access codes';
COMMENT ON FUNCTION cleanup_inactive_guests(INTEGER) IS 'Removes inactive guest users after specified hours';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'OpenChat V2 database schema migration completed successfully!';
    RAISE NOTICE 'New tables: users_v2, groups, group_members';
    RAISE NOTICE 'New functions: generate_reddit_style_username, generate_access_code, cleanup_inactive_guests';
    RAISE NOTICE 'Old tables renamed: messages -> messages_deprecated, pinned_messages -> pinned_messages_deprecated';
    RAISE NOTICE 'RLS policies configured for role-based access control';
END $$;