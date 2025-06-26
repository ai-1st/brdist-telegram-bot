-- Add session column to messages table for session-based chat history
ALTER TABLE public.messages ADD COLUMN session integer NOT NULL DEFAULT 1;

-- Create an index for better performance on session-based queries (tenant partitioned)
CREATE INDEX idx_messages_user_chat_bot_session ON public.messages(user_email, user_id, chat_id, bot_id, session);

-- Create an index for finding the latest message per user/chat/bot (tenant partitioned)
CREATE INDEX idx_messages_latest ON public.messages(user_email, user_id, chat_id, bot_id, created_at DESC);