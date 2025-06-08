-- Add bot_id and tg_bot_key_id columns to messages table
-- These will link messages to specific bots and telegram bot keys

-- Add bot_id column (references bots table)
ALTER TABLE messages 
ADD COLUMN bot_id UUID REFERENCES bots(id) ON DELETE CASCADE;

-- Add tg_bot_key_id column (references tg_bot_keys table)
ALTER TABLE messages 
ADD COLUMN tg_bot_key_id UUID REFERENCES tg_bot_keys(id) ON DELETE CASCADE;

-- Create indexes for the new foreign key columns to improve query performance
CREATE INDEX IF NOT EXISTS idx_messages_bot_id ON messages (bot_id);
CREATE INDEX IF NOT EXISTS idx_messages_tg_bot_key_id ON messages (tg_bot_key_id);

-- Create a composite index for common queries that might filter by both user and bot
CREATE INDEX IF NOT EXISTS idx_messages_user_bot ON messages (user_id, bot_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_bot ON messages (chat_id, bot_id); 