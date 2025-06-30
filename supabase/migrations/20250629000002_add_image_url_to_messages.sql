-- Add image_url field to messages table to store image URLs instead of generic text
ALTER TABLE public.messages ADD COLUMN image_url text;

-- Create index for faster image message lookups
CREATE INDEX idx_messages_image_url ON public.messages(image_url) WHERE image_url IS NOT NULL;

-- Comment explaining the change
COMMENT ON COLUMN public.messages.image_url IS 'URL of uploaded image/sticker/document - replaces generic [Image uploaded] text';