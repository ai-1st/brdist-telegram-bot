-- Add tg_token field to bots table for simplified architecture
ALTER TABLE public.bots ADD COLUMN tg_token text;

-- Create index for faster token lookups
CREATE INDEX idx_bots_tg_token ON public.bots(tg_token) WHERE tg_token IS NOT NULL;

-- Comment explaining the change
COMMENT ON COLUMN public.bots.tg_token IS 'Telegram bot token - simplified from separate tg_bot_keys table';