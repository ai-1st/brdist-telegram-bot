-- Create the storage bucket for BRDist telegram bot images
INSERT INTO storage.buckets (id, name, public, created_at, updated_at)
VALUES ('brdist-telegram-bot', 'brdist-telegram-bot', true, now(), now())
ON CONFLICT (id) DO NOTHING;

-- Set up storage policy to allow uploads from authenticated users
CREATE POLICY "Allow authenticated uploads" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'brdist-telegram-bot');

-- Set up storage policy to allow public access to images
CREATE POLICY "Allow public access" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'brdist-telegram-bot');

-- Allow service role full access
CREATE POLICY "Service role full access" ON storage.objects
TO service_role
USING (bucket_id = 'brdist-telegram-bot')
WITH CHECK (bucket_id = 'brdist-telegram-bot');