-- Add welcome_message and help_message columns to bots table
-- These columns will store customizable messages for each bot

-- Add welcome_message column
ALTER TABLE bots 
ADD COLUMN welcome_message TEXT DEFAULT 'Welcome! I''m here to help you. Type /help to see what I can do.';

-- Add help_message column  
ALTER TABLE bots
ADD COLUMN help_message TEXT DEFAULT 'Here are the commands I understand:

/start - Get started
/help - Show this help message

Just send me a message and I''ll do my best to help!';

-- Update existing bots to have the default messages if they don't already have them
UPDATE bots 
SET welcome_message = 'Welcome! I''m here to help you. Type /help to see what I can do.'
WHERE welcome_message IS NULL;

UPDATE bots
SET help_message = 'Here are the commands I understand:

/start - Get started  
/help - Show this help message

Just send me a message and I''ll do my best to help!'
WHERE help_message IS NULL; 