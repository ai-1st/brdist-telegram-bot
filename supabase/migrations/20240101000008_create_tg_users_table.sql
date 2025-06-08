-- Create tg_users table
CREATE TABLE IF NOT EXISTS tg_users (
  id BIGINT NOT NULL,
  user_email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  username TEXT,
  is_bot BOOLEAN NOT NULL DEFAULT false,
  language_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id, user_email)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_tg_users_username ON tg_users (username);
CREATE INDEX IF NOT EXISTS idx_tg_users_user_email ON tg_users (user_email);

-- Enable Row Level Security
ALTER TABLE tg_users ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to read only their own data
CREATE POLICY "Users can read their own data"
ON tg_users
FOR SELECT
USING (
  auth.jwt() ->> 'email' = user_email
);

-- Create policy to allow users to insert their own data
CREATE POLICY "Users can insert their own data"
ON tg_users
FOR INSERT
WITH CHECK (
  auth.jwt() ->> 'email' = user_email
);

-- Create policy to allow users to update their own data
CREATE POLICY "Users can update their own data"
ON tg_users
FOR UPDATE
USING (
  auth.jwt() ->> 'email' = user_email
)
WITH CHECK (
  auth.jwt() ->> 'email' = user_email
);

-- Create policy to allow users to delete their own data
CREATE POLICY "Users can delete their own data"
ON tg_users
FOR DELETE
USING (
  auth.jwt() ->> 'email' = user_email
);

-- Create policy to allow service role to access all data
CREATE POLICY "Service role can access all data"
ON tg_users
FOR ALL
USING (
  auth.jwt() ->> 'role' = 'service_role'
)
WITH CHECK (
  auth.jwt() ->> 'role' = 'service_role'
);

-- Add foreign key constraint to messages table
ALTER TABLE messages
ADD CONSTRAINT messages_user_id_user_email_fkey
FOREIGN KEY (user_id, user_email)
REFERENCES tg_users(id, user_email)
ON DELETE CASCADE; 