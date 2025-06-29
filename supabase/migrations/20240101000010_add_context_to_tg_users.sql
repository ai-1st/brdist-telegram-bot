-- Add context field to tg_users table for persistent user context across sessions
ALTER TABLE public.tg_users ADD COLUMN context text DEFAULT ''::text;