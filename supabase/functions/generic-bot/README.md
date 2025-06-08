# Generic Telegram Bot

A configurable Telegram bot that runs as a Supabase Edge Function. This bot can be configured through the database to provide custom system prompts, welcome/help messages, and integrates with Claude AI for intelligent responses.

## Architecture

The bot has been rebuilt with a clean, modular architecture:

- **`index.ts`** - Main entry point handling webhooks, commands, and CORS
- **`dal.ts`** - Data Access Layer for all database operations  
- **`reply.ts`** - Streaming response handler for real-time Telegram messages

## Features

- **Streaming Responses**: Messages are sent line-by-line as the LLM generates them
- **Special Commands**: 
  - `TG_IMAGE` - Send images with captions
  - `TG_CONCLUSION` - Send conclusion with suggestion buttons
- **Image Processing**: Analyze images sent by users
- **Web Search**: Optional Tavily integration for current information
- **Command Support**: `/start`, `/help`, `/clear`
- **Conversation History**: Maintains chat context in database
- **Multi-Bot Support**: Each bot identified by unique secret string

## Database Schema

The bot uses these tables:

### Bots Table
```sql
CREATE TABLE bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  secret_string TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT false,
  user_email TEXT NOT NULL,
  welcome_message TEXT DEFAULT 'Welcome! I''m here to help you. Type /help to see what I can do.',
  help_message TEXT DEFAULT 'Here are the commands I understand:\n\n/start - Get started\n/help - Show this help message\n\nJust send me a message and I''ll do my best to help!',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Messages Table
```sql
CREATE TABLE messages (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  chat_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  message_text TEXT NOT NULL,
  bot_id UUID REFERENCES bots(id),
  user_email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Telegram Bot Keys Table
```sql
CREATE TABLE tg_bot_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  tg_token TEXT NOT NULL,
  linked_bot UUID REFERENCES bots(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Telegram Users Table
```sql
CREATE TABLE tg_users (
  id BIGINT NOT NULL,
  user_email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  username TEXT,
  is_bot BOOLEAN NOT NULL DEFAULT false,
  language_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT tg_users_pkey PRIMARY KEY (id, user_email)
);
```

## Environment Variables

Required:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for database access
- `AWS_REGION` - AWS region for Bedrock
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key

Optional:
- `TAVILY_API_KEY` - For web search functionality

## Usage

### 1. Create a Bot

```sql
INSERT INTO bots (
  name, 
  system_prompt, 
  secret_string, 
  is_active, 
  user_email,
  welcome_message,
  help_message
)
VALUES (
  'My Assistant', 
  'You are a helpful AI assistant. Use TG_IMAGE to send images and TG_CONCLUSION for suggestions.', 
  'my-secret-123', 
  true, 
  'user@example.com',
  '👋 Hello {user_name}! I''m {bot_name}, your AI assistant.',
  '🤖 <b>{bot_name} Commands:</b>\n\n/start - Start fresh\n/help - Show help\n/clear - Clear history'
);
```

### 2. Link Telegram Token

```sql
INSERT INTO tg_bot_keys (user_email, tg_token, linked_bot)
VALUES ('user@example.com', 'YOUR_BOT_TOKEN', 'bot-id-from-step-1');
```

### 3. Deploy Function

```bash
supabase functions deploy generic-bot
```

### 4. Set Webhook

Make a request to:
```
https://<project-ref>.supabase.co/functions/v1/generic-bot/set-webhook?secret=my-secret-123
```

### 5. Bot Ready

Your bot will receive messages at:
```
https://<project-ref>.supabase.co/functions/v1/generic-bot?secret=my-secret-123
```

## System Prompt Format

The LLM is instructed to use special commands:

```
You must use special commands in your response:
1. To send an image: TG_IMAGE image_url; image_caption
2. To send a conclusion with suggestions: TG_CONCLUSION conclusion_text; suggestion1; suggestion2; suggestion3

Use HTML for text formatting.
```

## Message Placeholders

Welcome and help messages support:
- `{bot_name}` - Bot's name from database
- `{user_name}` - User's first name from Telegram

## Development

Local testing:
```bash
supabase functions serve generic-bot --env-file ./supabase/.env.local
```

Type checking:
```bash
deno check index.ts
```

## CORS Configuration

The function uses origin reflection for CORS:
- Reflects the origin header for compatibility
- Supports credentials
- Works with any domain

## Benefits

- **Clean Architecture**: Simple 3-file structure
- **Real-time Streaming**: Responsive user experience
- **Multi-Bot Support**: Single deployment, multiple bots
- **Database Configuration**: Easy bot management
- **Type Safe**: Full TypeScript support