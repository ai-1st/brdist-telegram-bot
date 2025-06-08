import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* Data Schema for reference - do not remove
-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.bots (
  updated_at timestamp with time zone DEFAULT now(),
  user_email text NOT NULL,
  name text NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  system_prompt text NOT NULL DEFAULT ''::text,
  secret_string text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'::text),
  is_active boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  welcome_message text DEFAULT 'Welcome! I''m here to help you. Type /help to see what I can do.'::text,
  help_message text DEFAULT 'Here are the commands I understand:\n\n/start - Get started\n/help - Show this help message\n\nJust send me a message and I''ll do my best to help!'::text,
  CONSTRAINT bots_pkey PRIMARY KEY (id)
);
CREATE TABLE public.messages (
  user_id bigint NOT NULL,
  chat_id bigint NOT NULL,
  role text NOT NULL,
  message_text text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  id bigint NOT NULL DEFAULT nextval('messages_id_seq'::regclass),
  bot_id uuid,
  tg_bot_key_id uuid,
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_tg_bot_key_id_fkey FOREIGN KEY (tg_bot_key_id) REFERENCES public.tg_bot_keys(id),
  CONSTRAINT messages_bot_id_fkey FOREIGN KEY (bot_id) REFERENCES public.bots(id)
);
CREATE TABLE public.tg_bot_keys (
  user_email text NOT NULL,
  tg_token text NOT NULL,
  linked_bot uuid,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tg_bot_keys_pkey PRIMARY KEY (id),
  CONSTRAINT tg_bot_keys_linked_bot_fkey FOREIGN KEY (linked_bot) REFERENCES public.bots(id)
);
*/

export interface BotConfig {
  id: string;
  name: string;
  system_prompt: string;
  secret_string: string;
  is_active: boolean;
  welcome_message: string;
  help_message: string;
  tg_token?: string;
}

export interface Message {
  id?: number;
  user_id: number;
  chat_id: number;
  role: 'user' | 'assistant' | 'system';
  message_text: string;
  bot_id?: string;
  tg_bot_key_id?: string;
  created_at?: string;
}

function getSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }
  
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function loadBotConfig(secretString: string): Promise<BotConfig | null> {
  const supabase = getSupabaseClient();
  
  try {
    // First get the bot by secret_string
    const { data: bot, error: botError } = await supabase
      .from('bots')
      .select('id, name, system_prompt, secret_string, is_active, welcome_message, help_message')
      .eq('secret_string', secretString)
      .eq('is_active', true)
      .single();
    
    if (botError || !bot) {
      console.error('Bot not found or error:', botError);
      return null;
    }
    
    // Get the telegram token for this bot
    const { data: tgKey, error: tgError } = await supabase
      .from('tg_bot_keys')
      .select('tg_token')
      .eq('linked_bot', bot.id)
      .single();
    
    if (tgError) {
      console.error('Telegram key not found:', tgError);
      // Bot exists but no telegram key - this might be ok for some cases
    }
    
    return {
      id: bot.id,
      name: bot.name,
      system_prompt: bot.system_prompt,
      secret_string: bot.secret_string,
      is_active: bot.is_active,
      welcome_message: bot.welcome_message,
      help_message: bot.help_message,
      tg_token: tgKey?.tg_token
    };
  } catch (error) {
    console.error('Error loading bot config:', error);
    return null;
  }
}

export async function getChatHistory(
  userId: number, 
  chatId: number, 
  botId: string, 
  limit: number = 20
): Promise<Message[]> {
  const supabase = getSupabaseClient();
  
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', userId)
      .eq('chat_id', chatId)
      .eq('bot_id', botId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('Error fetching chat history:', error);
      return [];
    }
    
    // Return in chronological order (oldest first)
    return (data || []).reverse();
  } catch (error) {
    console.error('Error in getChatHistory:', error);
    return [];
  }
}

export async function addMessageToHistory(message: Message): Promise<boolean> {
  const supabase = getSupabaseClient();
  
  try {
    const { error } = await supabase
      .from('messages')
      .insert([{
        user_id: message.user_id,
        chat_id: message.chat_id,
        role: message.role,
        message_text: message.message_text,
        bot_id: message.bot_id,
        tg_bot_key_id: message.tg_bot_key_id
      }]);
    
    if (error) {
      console.error('Error adding message to history:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error in addMessageToHistory:', error);
    return false;
  }
}

export async function clearChatHistory(
  userId: number, 
  chatId: number, 
  botId: string
): Promise<boolean> {
  const supabase = getSupabaseClient();
  
  try {
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('user_id', userId)
      .eq('chat_id', chatId)
      .eq('bot_id', botId);
    
    if (error) {
      console.error('Error clearing chat history:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error in clearChatHistory:', error);
    return false;
  }
} 