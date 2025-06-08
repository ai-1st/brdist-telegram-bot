-- Enable Row Level Security
ALTER TABLE tg_bot_keys ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to read only their own bot keys
CREATE POLICY "Users can read their own bot keys"
ON tg_bot_keys
FOR SELECT
USING (
  auth.jwt() ->> 'email' = user_email
);

-- Create policy to allow users to insert their own bot keys
CREATE POLICY "Users can insert their own bot keys"
ON tg_bot_keys
FOR INSERT
WITH CHECK (
  auth.jwt() ->> 'email' = user_email
);

-- Create policy to allow users to update their own bot keys
CREATE POLICY "Users can update their own bot keys"
ON tg_bot_keys
FOR UPDATE
USING (
  auth.jwt() ->> 'email' = user_email
)
WITH CHECK (
  auth.jwt() ->> 'email' = user_email
);

-- Create policy to allow users to delete their own bot keys
CREATE POLICY "Users can delete their own bot keys"
ON tg_bot_keys
FOR DELETE
USING (
  auth.jwt() ->> 'email' = user_email
);

-- Create policy to allow service role to access all bot keys
CREATE POLICY "Service role can access all bot keys"
ON tg_bot_keys
FOR ALL
USING (
  auth.jwt() ->> 'role' = 'service_role'
)
WITH CHECK (
  auth.jwt() ->> 'role' = 'service_role'
); 