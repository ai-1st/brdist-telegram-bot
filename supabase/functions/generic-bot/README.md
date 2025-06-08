# Generic Bot - Functional Architecture

A refactored Telegram bot system using functional programming principles instead of classes. The system supports multiple bots distinguished by their `secret_string` parameter and loads configuration from the database.

## Architecture

### Modules

1. **`dal.ts`** - Database Access Layer
   - `loadBotConfig(secretString)` - Load bot configuration by secret
   - `getChatHistory(userId, chatId, botId)` - Retrieve chat history
   - `addMessageToHistory(message)` - Save message to database
   - `clearChatHistory(userId, chatId, botId)` - Clear chat history

2. **`telegram.ts`** - Telegram API Functions
   - `sendTelegramMessage(botToken, chatId, text, replyMarkup?)` - Send messages
   - `sendTelegramPhoto(botToken, chatId, photoUrl, caption?)` - Send photos
   - `sendChatAction(botToken, chatId, action?)` - Send typing indicators
   - `getFileUrl(botToken, fileId)` - Get file URLs from Telegram
   - `setWebhook(botToken, webhookUrl)` - Configure webhooks
   - `processStreamLine(line, botToken, chatId)` - Process streaming responses

3. **`llm.ts`** - LLM Integration Functions
   - `generateResponse(messages, config?)` - Generate streaming responses
   - `processImageWithLLM(imageUrl, caption, systemPrompt, config?)` - Analyze images
   - `messagesToChatMessages(messages, systemPrompt)` - Convert database messages
   - `createWelcomeMessage(botName, userName?)` - Generate welcome messages
   - `createHelpMessage()` - Generate help text

4. **`handler.ts`** - Main Request Handler
   - `handleWebhook(request)` - Process Telegram webhooks
   - `handleSetWebhook(request)` - Configure webhook endpoints
   - Individual handlers for start, help, clear, text, and image messages

5. **`index.ts`** - Entry Point
   - Simple import of the main handler

## Key Features

### Multi-Bot Support
- Each bot is identified by its `secret_string` parameter in the URL
- Bot configuration is loaded from the database (`bots` table)
- System prompt comes from `bot.system_prompt` field
- Telegram token is linked via `tg_bot_keys` table

### Customizable Messages
- Welcome and help messages are stored in the database
- Support for placeholder variables: `{bot_name}` and `{user_name}`
- Each bot can have unique welcome and help messages
- Messages are personalized when sent to users

### Database Integration
- Chat history is persisted to the `messages` table
- Messages are linked to specific bots via `bot_id`
- Automatic history management with configurable limits

### Functional Design
- No classes - only pure functions
- Easy to test individual functions
- Clear separation of concerns
- Dependency injection through function parameters

## Usage

### Setting Up a Webhook
```
GET/POST /functions/v1/generic-bot/set-webhook?secret=BOT_SECRET_STRING
```

### Webhook Endpoint
```
POST /functions/v1/generic-bot?secret=BOT_SECRET_STRING
```

## Environment Variables

Required:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for database access
- `AWS_REGION` - AWS region for Bedrock
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key

Optional:
- `TAVILY_API_KEY` - For web search functionality

## Database Schema

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
  chat_id BIGINT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  message_text TEXT NOT NULL,
  bot_id UUID REFERENCES bots(id),
  tg_bot_key_id UUID REFERENCES tg_bot_keys(id),
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

## Message Placeholders

The welcome and help messages support the following placeholders:

- `{bot_name}` - Replaced with the bot's name from the database
- `{user_name}` - Replaced with the user's first name from Telegram (falls back to "there")

### Example Templates

**Welcome Message:**
```
👋 Hello {user_name}! I'm {bot_name}, your personal AI assistant. How can I help you today?
```

**Help Message:**
```
🤖 <b>{bot_name} Commands:</b>

/start - Start fresh conversation
/help - Show this help message  
/clear - Clear chat history

Just send me any message and I'll do my best to help!
```

## Example Usage

1. Create a bot in the database:
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
  'My Bot', 
  'You are a helpful assistant.', 
  'my-secret-123', 
  true, 
  'user@example.com',
  '👋 Hello {user_name}! I''m {bot_name}, your personal AI assistant. How can I help you today?',
  '🤖 <b>{bot_name} Commands:</b>\n\n/start - Start fresh\n/help - Show this help\n/clear - Clear history\n\nJust send me any message!'
);
```

2. Link a Telegram token:
```sql
INSERT INTO tg_bot_keys (user_email, tg_token, linked_bot)
VALUES ('user@example.com', 'YOUR_BOT_TOKEN', 'bot-id-from-step-1');
```

3. Set the webhook:
```
POST /functions/v1/generic-bot/set-webhook?secret=my-secret-123
```

4. Bot is ready to receive messages at:
```
/functions/v1/generic-bot?secret=my-secret-123
```

## Database Migration

To add the welcome and help message columns to existing installations, run the migration:

```bash
supabase migration up
```

This will add the `welcome_message` and `help_message` columns to the `bots` table with sensible defaults.

## Benefits

- **Testable**: Each function can be tested in isolation
- **Maintainable**: Clear separation of concerns
- **Scalable**: Supports multiple bots from single deployment
- **Configurable**: System prompts and behavior stored in database
- **Functional**: No classes, just pure functions 