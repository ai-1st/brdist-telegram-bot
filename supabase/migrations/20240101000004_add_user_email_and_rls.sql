-- Add user_email column to messages table
ALTER TABLE messages 
ADD COLUMN user_email TEXT NOT NULL DEFAULT '';

-- Create index for user_email to improve query performance
CREATE INDEX IF NOT EXISTS idx_messages_user_email ON messages (user_email);

-- Enable Row Level Security
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to read only their own messages
CREATE POLICY "Users can read their own messages"
ON messages
FOR SELECT
USING (
  auth.jwt() ->> 'email' = user_email
);

-- Create policy to allow users to insert their own messages
CREATE POLICY "Users can insert their own messages"
ON messages
FOR INSERT
WITH CHECK (
  auth.jwt() ->> 'email' = user_email
);

-- Create policy to allow users to update their own messages
CREATE POLICY "Users can update their own messages"
ON messages
FOR UPDATE
USING (
  auth.jwt() ->> 'email' = user_email
)
WITH CHECK (
  auth.jwt() ->> 'email' = user_email
);

-- Create policy to allow users to delete their own messages
CREATE POLICY "Users can delete their own messages"
ON messages
FOR DELETE
USING (
  auth.jwt() ->> 'email' = user_email
);

-- Create policy to allow service role to access all messages
CREATE POLICY "Service role can access all messages"
ON messages
FOR ALL
USING (
  auth.jwt() ->> 'role' = 'service_role'
)
WITH CHECK (
  auth.jwt() ->> 'role' = 'service_role'
); 