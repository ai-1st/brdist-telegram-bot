-- Create messages table for storing conversation history
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id BIGINT NOT NULL,
  chat_id BIGINT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  message_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  -- Add indexes for common queries
  INDEX idx_messages_user_chat (user_id, chat_id),
  INDEX idx_messages_created_at (created_at DESC)
);

-- Create brd_sessions table for tracking BRD creation sessions
CREATE TABLE IF NOT EXISTS brd_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id BIGINT NOT NULL,
  chat_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'exported')),
  current_step TEXT,
  brd_data JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  -- Add indexes for common queries
  INDEX idx_brd_sessions_user_chat (user_id, chat_id),
  INDEX idx_brd_sessions_status (status),
  INDEX idx_brd_sessions_created_at (created_at DESC)
);

-- Create specs table for storing generated specifications
CREATE TABLE IF NOT EXISTS specs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id BIGINT NOT NULL,
  chat_id BIGINT NOT NULL,
  session_id UUID REFERENCES brd_sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  spec_type TEXT NOT NULL DEFAULT 'project' CHECK (spec_type IN ('project', 'feature', 'architecture', 'implementation')),
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  -- Add indexes for common queries
  INDEX idx_specs_user_chat (user_id, chat_id),
  INDEX idx_specs_session_id (session_id),
  INDEX idx_specs_spec_type (spec_type),
  INDEX idx_specs_created_at (created_at DESC)
);

-- Create spec_versions table for tracking spec history
CREATE TABLE IF NOT EXISTS spec_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  spec_id UUID REFERENCES specs(id) ON DELETE CASCADE NOT NULL,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  change_summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_by BIGINT NOT NULL,
  
  -- Add unique constraint and indexes
  UNIQUE (spec_id, version),
  INDEX idx_spec_versions_spec_id (spec_id),
  INDEX idx_spec_versions_created_at (created_at DESC)
);

-- Create trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers to update updated_at columns
CREATE TRIGGER update_brd_sessions_updated_at BEFORE UPDATE ON brd_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_specs_updated_at BEFORE UPDATE ON specs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to automatically version specs
CREATE OR REPLACE FUNCTION create_spec_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create a version if the content has changed
  IF OLD.content IS DISTINCT FROM NEW.content THEN
    INSERT INTO spec_versions (spec_id, version, content, change_summary, created_by)
    VALUES (NEW.id, OLD.version, OLD.content, 'Auto-versioned on update', NEW.user_id);
    
    -- Increment the version number
    NEW.version = OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add trigger to auto-version specs on update
CREATE TRIGGER version_specs_on_update BEFORE UPDATE ON specs
  FOR EACH ROW EXECUTE FUNCTION create_spec_version();

-- Add RLS (Row Level Security) policies
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE brd_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE spec_versions ENABLE ROW LEVEL SECURITY;

-- Create policies (adjust based on your auth strategy)
-- For now, we'll use service role key which bypasses RLS
-- In production, you'd want proper user-based policies