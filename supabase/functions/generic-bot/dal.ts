// ABOUTME: Data Access Layer for generic bot - handles all database operations
// ABOUTME: Manages bot configuration, message history, and user data in Supabase

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateText } from 'https://esm.sh/ai@4.2.6';
import { createAmazonBedrock } from 'https://esm.sh/@ai-sdk/amazon-bedrock';

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
  tg_token text,
  CONSTRAINT bots_pkey PRIMARY KEY (id)
);

CREATE TABLE public.messages (
  user_id bigint NOT NULL,
  chat_id bigint NOT NULL,
  role text NOT NULL,
  message_text text NOT NULL,
  image_url text,
  created_at timestamp with time zone DEFAULT now(),
  id bigint NOT NULL DEFAULT nextval('messages_id_seq'::regclass),
  bot_id uuid,
  tg_bot_key_id uuid,
  user_email text NOT NULL DEFAULT ''::text,
  session integer NOT NULL DEFAULT 1,
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_bot_id_fkey FOREIGN KEY (bot_id) REFERENCES public.bots(id),
  CONSTRAINT messages_tg_bot_key_id_fkey FOREIGN KEY (tg_bot_key_id) REFERENCES public.tg_bot_keys(id)
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

CREATE TABLE public.tg_users (
  is_bot boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  id bigint NOT NULL,
  user_email text NOT NULL,
  first_name text,
  last_name text,
  username text,
  language_code text,
  context text DEFAULT ''::text,
  CONSTRAINT tg_users_pkey PRIMARY KEY (id, user_email)
);
*/

export interface BotConfig {
  id: string;
  name: string;
  tg_token: string | null;
  user_email: string;
  system_prompt: string;
  welcome_message: string;
  help_message: string;
  is_active: boolean;
  secret_string: string;
  created_at?: string;
  updated_at?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  image_url?: string;
}

export interface DbMessage {
  id?: number;
  user_id: number;
  chat_id: string;
  role: 'user' | 'assistant' | 'system';
  message_text: string;
  image_url?: string;
  bot_id?: string;
  user_email: string;
  created_at?: string;
  session?: number;
}

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  is_bot: boolean;
  language_code?: string;
}

export interface Webtool {
  id: string;
  user_email: string;
  bot_id: string;
  name: string;
  url: string;
  description: string;
  context_config: Record<string, unknown>;
  is_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

// Get Supabase client
function getSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }
  
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Load bot configuration by secret
export async function loadBotConfig(secretString: string): Promise<BotConfig | null> {
  const supabase = getSupabaseClient();
  
  try {
    console.log(`[loadBotConfig] Searching for bot with secret: ${secretString}`);
    
    const { data: bot, error: botError } = await supabase
      .from('bots')
      .select('*')
      .eq('secret_string', secretString)
      .eq('is_active', true)
      .single();
    
    if (botError || !bot) {
      console.error('[loadBotConfig] Bot not found or error:', botError);
      return null;
    }
    
    console.log(`[loadBotConfig] Found bot: ${bot.name} (${bot.id})`);
    
    if (bot.tg_token) {
      console.log(`[loadBotConfig] Bot has telegram token: ${bot.tg_token.substring(0, 10)}...`);
    } else {
      console.log('[loadBotConfig] Bot has no telegram token assigned');
    }
    
    return {
      id: bot.id,
      name: bot.name,
      tg_token: bot.tg_token,
      user_email: bot.user_email,
      system_prompt: bot.system_prompt,
      welcome_message: bot.welcome_message,
      help_message: bot.help_message,
      is_active: bot.is_active,
      secret_string: bot.secret_string,
      created_at: bot.created_at,
      updated_at: bot.updated_at
    };
  } catch (error) {
    console.error('Error in loadBotConfig:', error);
    return null;
  }
}

// Get chat history for current active session
export async function getChatHistory(
  userId: number, 
  chatId: string, 
  botId: string,
  userEmail: string,
  limit: number = 20
): Promise<ChatMessage[]> {
  const supabase = getSupabaseClient();
  
  try {
    // First, get the current session number
    const currentSession = await getCurrentSession(userId, chatId, botId, userEmail);
    
    console.log(`[getChatHistory] Using session ${currentSession} for user ${userId} in chat ${chatId}`);
    
    const { data, error } = await supabase
      .from('messages')
      .select('role, message_text, image_url, created_at')
      .eq('user_email', userEmail)
      .eq('user_id', userId)
      .eq('chat_id', chatId)
      .eq('bot_id', botId)
      .eq('session', currentSession)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('Error fetching chat history:', error);
      return [];
    }
    
    // Filter out /clear messages and convert to ChatMessage format
    return (data || [])
      .filter(msg => msg.message_text !== '/clear')
      .reverse()
      .map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.message_text,
        image_url: msg.image_url
      }));
  } catch (error) {
    console.error('Error in getChatHistory:', error);
    return [];
  }
}

// Get current session number for a user/chat/bot combination
async function getCurrentSession(
  userId: number, 
  chatId: string, 
  botId: string,
  userEmail: string
): Promise<number> {
  const supabase = getSupabaseClient();
  
  try {
    // Get the latest message for this user/chat/bot
    const { data: latestMessage, error } = await supabase
      .from('messages')
      .select('session, message_text, created_at')
      .eq('user_email', userEmail)
      .eq('user_id', userId)
      .eq('chat_id', chatId)
      .eq('bot_id', botId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error || !latestMessage) {
      // No messages found, start with session 1
      console.log(`[getCurrentSession] No messages found, starting with session 1`);
      return 1;
    }
    
    const now = new Date();
    const messageTime = new Date(latestMessage.created_at);
    const hoursDiff = (now.getTime() - messageTime.getTime()) / (1000 * 60 * 60);
    
    // If last message was /clear or more than 24 hours ago, start new session
    if (latestMessage.message_text === '/clear' || hoursDiff > 24) {
      const newSession = latestMessage.session + 1;
      console.log(`[getCurrentSession] Starting new session ${newSession} (last message: ${latestMessage.message_text}, hours ago: ${hoursDiff.toFixed(1)})`);
      
      // If session expired (not manually cleared), enrich context from previous session
      if (latestMessage.message_text !== '/clear' && hoursDiff > 24) {
        console.log(`[getCurrentSession] Session expired, enriching context from session ${latestMessage.session}`);
        try {
          await enrichUserContext(userId, chatId, botId, userEmail, latestMessage.session);
        } catch (error) {
          console.error('[getCurrentSession] Error enriching context for expired session:', error);
        }
      }
      
      return newSession;
    }
    
    // Continue with current session
    console.log(`[getCurrentSession] Continuing with session ${latestMessage.session}`);
    return latestMessage.session;
  } catch (error) {
    console.error('Error in getCurrentSession:', error);
    return 1;
  }
}

// Add message to history
export async function addMessageToHistory(message: DbMessage): Promise<boolean> {
  const supabase = getSupabaseClient();
  
  try {
    console.log(`[addMessageToHistory] Adding message for user ${message.user_id} in chat ${message.chat_id}`);
    
    // Ensure Telegram user exists
    await upsertTelegramUser(message.user_id, message.user_email);
    
    // Get current session number if not provided
    let sessionNumber = message.session;
    if (!sessionNumber) {
      sessionNumber = await getCurrentSession(message.user_id, message.chat_id, message.bot_id || '', message.user_email);
    }
    
    console.log(`[addMessageToHistory] Using session ${sessionNumber}`);
    
    // Add message
    const { error } = await supabase
      .from('messages')
      .insert({
        user_id: message.user_id,
        chat_id: message.chat_id,
        role: message.role,
        message_text: message.message_text,
        image_url: message.image_url,
        bot_id: message.bot_id,
        user_email: message.user_email,
        session: sessionNumber
      });
    
    if (error) {
      console.error('[addMessageToHistory] Error adding message:', error);
      return false;
    }
    
    console.log('[addMessageToHistory] Message added successfully');
    return true;
  } catch (error) {
    console.error('[addMessageToHistory] Unexpected error:', error);
    return false;
  }
}

// Add /clear message to mark session as closed and enrich user context
export async function addClearMessage(
  userId: number, 
  chatId: string, 
  botId: string,
  userEmail: string
): Promise<boolean> {
  const supabase = getSupabaseClient();
  
  try {
    // Get current session
    const currentSession = await getCurrentSession(userId, chatId, botId, userEmail);
    
    console.log(`[addClearMessage] Adding /clear message for session ${currentSession}`);
    
    // Enrich user context before closing session
    try {
      await enrichUserContext(userId, chatId, botId, userEmail, currentSession);
    } catch (error) {
      console.error('[addClearMessage] Error enriching context (continuing with /clear):', error);
    }
    
    // Add /clear message to current session
    const { error } = await supabase
      .from('messages')
      .insert({
        user_id: userId,
        chat_id: chatId,
        role: 'user',
        message_text: '/clear',
        bot_id: botId,
        user_email: userEmail,
        session: currentSession
      });
    
    if (error) {
      console.error('[addClearMessage] Error adding /clear message:', error);
      return false;
    }
    
    console.log('[addClearMessage] /clear message added successfully');
    return true;
  } catch (error) {
    console.error('Error in addClearMessage:', error);
    return false;
  }
}

// Legacy function for backward compatibility - now just adds clear message
export async function clearChatHistory(
  userId: number, 
  chatId: string, 
  botId: string,
  userEmail: string = ''
): Promise<boolean> {
  return await addClearMessage(userId, chatId, botId, userEmail);
}

// Upsert Telegram user
export async function upsertTelegramUser(
  userId: number,
  userEmail: string,
  userData?: TelegramUser
): Promise<boolean> {
  const supabase = getSupabaseClient();
  
  try {
    const upsertData: {
      id: number;
      user_email: string;
      updated_at: string;
      first_name?: string;
      last_name?: string;
      username?: string;
      is_bot?: boolean;
      language_code?: string;
    } = {
      id: userId,
      user_email: userEmail,
      updated_at: new Date().toISOString()
    };
    
    // Add optional user data if provided
    if (userData) {
      upsertData.first_name = userData.first_name;
      upsertData.last_name = userData.last_name;
      upsertData.username = userData.username;
      upsertData.is_bot = userData.is_bot;
      upsertData.language_code = userData.language_code;
    }
    
    const { error } = await supabase
      .from('tg_users')
      .upsert(upsertData, {
        onConflict: 'id,user_email'
      });
    
    if (error) {
      console.error('Error upserting Telegram user:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error in upsertTelegramUser:', error);
    return false;
  }
}

// Personalize welcome message
export function personalizeWelcomeMessage(
  template: string, 
  botName: string, 
  userName?: string
): string {
  const name = userName || "there";
  return template
    .replace(/\{bot_name\}/g, botName)
    .replace(/\{user_name\}/g, name);
}

// Personalize help message
export function personalizeHelpMessage(
  template: string, 
  botName: string
): string {
  return template.replace(/\{bot_name\}/g, botName);
}

// Get webtools for a bot
export async function getWebtoolsForBot(botId: string): Promise<Webtool[]> {
  const supabase = getSupabaseClient();
  
  try {
    console.log(`[getWebtoolsForBot] Fetching webtools for bot: ${botId}`);
    
    const { data, error } = await supabase
      .from('webtools')
      .select('*')
      .eq('bot_id', botId)
      .eq('is_enabled', true);
    
    if (error) {
      console.error('[getWebtoolsForBot] Error fetching webtools:', error);
      return [];
    }
    
    console.log(`[getWebtoolsForBot] Found ${data?.length || 0} enabled webtools`);
    return data || [];
  } catch (error) {
    console.error('[getWebtoolsForBot] Unexpected error:', error);
    return [];
  }
}

// Get Amazon Bedrock model
function getModel() {
  const bedrock = createAmazonBedrock({
    region: Deno.env.get('AWS_REGION') || 'us-east-1',
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY'),
  });
  
  return bedrock('us.anthropic.claude-3-7-sonnet-20250219-v1:0');
}

// Get user context from tg_users table
export async function getUserContext(userId: number, userEmail: string): Promise<string> {
  const supabase = getSupabaseClient();
  
  try {
    const { data, error } = await supabase
      .from('tg_users')
      .select('context')
      .eq('id', userId)
      .eq('user_email', userEmail)
      .single();
    
    if (error || !data) {
      console.log(`[getUserContext] No context found for user ${userId}`);
      return '';
    }
    
    return data.context || '';
  } catch (error) {
    console.error('[getUserContext] Error fetching user context:', error);
    return '';
  }
}

// Update user context in tg_users table
export async function updateUserContext(userId: number, userEmail: string, context: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  
  try {
    console.log(`[updateUserContext] Updating context for user ${userId}`);
    
    const { error } = await supabase
      .from('tg_users')
      .update({ 
        context: context,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .eq('user_email', userEmail);
    
    if (error) {
      console.error('[updateUserContext] Error updating user context:', error);
      return false;
    }
    
    console.log('[updateUserContext] User context updated successfully');
    return true;
  } catch (error) {
    console.error('[updateUserContext] Unexpected error:', error);
    return false;
  }
}

// Enrich user context using LLM analysis of session messages
export async function enrichUserContext(
  userId: number,
  chatId: string,
  botId: string,
  userEmail: string,
  sessionNumber: number
): Promise<boolean> {
  const supabase = getSupabaseClient();
  
  try {
    console.log(`[enrichUserContext] Enriching context for user ${userId}, session ${sessionNumber}`);
    
    // Get current user context
    const currentContext = await getUserContext(userId, userEmail);
    
    // Get all messages from the session (excluding /clear)
    const { data: sessionMessages, error } = await supabase
      .from('messages')
      .select('role, message_text, created_at')
      .eq('user_email', userEmail)
      .eq('user_id', userId)
      .eq('chat_id', chatId)
      .eq('bot_id', botId)
      .eq('session', sessionNumber)
      .neq('message_text', '/clear')
      .order('created_at', { ascending: true });
    
    if (error || !sessionMessages || sessionMessages.length === 0) {
      console.log(`[enrichUserContext] No session messages found for enrichment`);
      return false;
    }
    
    // Format messages for LLM analysis
    const conversationText = sessionMessages
      .map(msg => `${msg.role}: ${msg.message_text}`)
      .join('\n');
    
    // Create prompt for context enrichment
    const enrichmentPrompt = `
You are analyzing a conversation to extract and update user context. Your task is to:

1. Review the current user context (if any)
2. Analyze the conversation for new facts, preferences, and important details about the user
3. Update the context to include new information while preserving existing relevant context
4. Keep the context concise but comprehensive

Current user context:
${currentContext || 'No previous context'}

Recent conversation:
${conversationText}

Please provide an updated user context that includes:
- User preferences and interests
- Important personal details mentioned
- Communication style preferences
- Any specific needs or requirements
- Key facts about the user's situation or goals

Return ONLY the updated context text, nothing else. Keep it under 500 words and focus on facts that would be useful for future conversations.
`;

    // Use LLM to enrich context
    const result = await generateText({
      model: getModel(),
      prompt: enrichmentPrompt,
      maxTokens: 600,
    });
    
    const enrichedContext = result.text.trim();
    
    if (enrichedContext && enrichedContext.length > 10) {
      // Update user context
      const success = await updateUserContext(userId, userEmail, enrichedContext);
      if (success) {
        console.log(`[enrichUserContext] Context enriched successfully for user ${userId}`);
        return true;
      }
    }
    
    console.log(`[enrichUserContext] No meaningful context enrichment generated`);
    return false;
  } catch (error) {
    console.error('[enrichUserContext] Error enriching user context:', error);
    return false;
  }
}