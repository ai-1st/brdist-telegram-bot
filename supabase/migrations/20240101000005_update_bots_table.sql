

-- Create index for user_email to improve query performance
CREATE INDEX IF NOT EXISTS idx_bots_user_email ON bots (user_email);

-- Enable Row Level Security
ALTER TABLE bots ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to read only their own bots
CREATE POLICY "Users can read their own bots"
ON bots
FOR SELECT
USING (
  auth.jwt() ->> 'email' = user_email
);

-- Create policy to allow users to insert their own bots
CREATE POLICY "Users can insert their own bots"
ON bots
FOR INSERT
WITH CHECK (
  auth.jwt() ->> 'email' = user_email
);

-- Create policy to allow users to update their own bots
CREATE POLICY "Users can update their own bots"
ON bots
FOR UPDATE
USING (
  auth.jwt() ->> 'email' = user_email
)
WITH CHECK (
  auth.jwt() ->> 'email' = user_email
);

-- Create policy to allow users to delete their own bots
CREATE POLICY "Users can delete their own bots"
ON bots
FOR DELETE
USING (
  auth.jwt() ->> 'email' = user_email
);

-- Create policy to allow service role to access all bots
CREATE POLICY "Service role can access all bots"
ON bots
FOR ALL
USING (
  auth.jwt() ->> 'role' = 'service_role'
)
WITH CHECK (
  auth.jwt() ->> 'role' = 'service_role'
); 