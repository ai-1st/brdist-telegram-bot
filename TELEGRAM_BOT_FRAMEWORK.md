# Telegram Bot Framework

A modular TypeScript framework for building AI-powered Telegram bots with streaming responses, web search capabilities, and special meta-commands.

## Features

- 🚀 **Streaming Responses** - Real-time message streaming with line-by-line processing
- 🔍 **Web Search** - Built-in Tavily integration for current information
- 🖼️ **TG_IMAGE Command** - Send images with captions
- 🎯 **TG_CONCLUSION Command** - Interactive keyboard suggestions
- 🧩 **Extensible Architecture** - Override methods to customize behavior
- 💬 **Chat History Management** - Built-in conversation context
- 🛠️ **Custom Tools** - Add your own AI tools and functions

## Quick Start

### 1. Create Your Bot Class

```typescript
import { TelegramBot } from '../lib/telegram-bot-framework.ts';

class MyCustomBot extends TelegramBot {
  
  // Override system instructions
  getSystemInstructions(): string {
    return `You are a helpful assistant specialized in...
    
    Use these commands:
    - TG_IMAGE url; caption - Send images
    - TG_CONCLUSION text; option1; option2 - Show suggestions
    
    Always be helpful and end with suggestions.`;
  }
  
  // Customize the welcome message
  async handleStartCommand(message: TelegramMessage): Promise<void> {
    await this.sendTelegramMessage(
      message.chat.id,
      "<b>Welcome!</b> I'm your custom bot..."
    );
  }
}
```

### 2. Initialize and Deploy

```typescript
import { serve } from "https://deno.land/std/http/server.ts";
import { createAmazonBedrock } from 'https://esm.sh/@ai-sdk/amazon-bedrock';

function createBot() {
  const bedrock = createAmazonBedrock({
    region: Deno.env.get('AWS_REGION'),
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')
  });
  
  const model = bedrock("us.anthropic.claude-3-7-sonnet-20250219-v1:0");
  
  return new MyCustomBot({
    botToken: Deno.env.get('TELEGRAM_BOT_TOKEN'),
    model: model,
    tavilyApiKey: Deno.env.get('TAVILY_API_KEY'), // Optional
    streamingDelayMs: 200
  });
}

// Webhook handler
serve(async (req) => {
  const bot = createBot();
  const update = await req.json();
  await bot.handleWebhook(update);
  return new Response("OK", { status: 200 });
});
```

## Core Methods to Override

### `getSystemInstructions(): string`
Define the AI's behavior and personality. Must include instructions for TG_IMAGE and TG_CONCLUSION commands.

### `loadChatHistory(userId: number, chatId: number): Promise<ChatMessage[]>`
Implement persistence for conversation history. Default returns empty array.

### `addChatHistory(userId: number, chatId: number, message: ChatMessage): Promise<void>`
Save messages to your storage. Default does nothing.

### `handleStartCommand(message: TelegramMessage): Promise<void>`
Customize the `/start` command response.

### `handleCommand(command: string, message: TelegramMessage): Promise<boolean>`
Add custom commands. Return `true` if handled, `false` otherwise.

### `processImage(imageUrl: string, caption?: string): Promise<string | any>`
Process uploaded images. Default returns caption or generic message.

### `getCustomTools(): Promise<any>`
Add custom AI tools using the Vercel AI SDK format.

## Meta Commands

### TG_IMAGE
Send images to users:
```
TG_IMAGE https://example.com/image.jpg; Optional caption text
```

### TG_CONCLUSION
Send conclusion with keyboard suggestions:
```
TG_CONCLUSION What would you like to do?; Option 1; Option 2; Option 3
```

## Examples

### Generic Chat Bot
A general-purpose assistant with web search:
```typescript
class GenericChatBot extends TelegramBot {
  getSystemInstructions(): string {
    return `You are a friendly AI assistant...`;
  }
}
```

### Recipe Bot
Specialized cooking assistant:
```typescript
class RecipeBot extends TelegramBot {
  async getCustomTools() {
    return {
      save_recipe: tool({
        description: 'Save a recipe',
        parameters: z.object({
          recipeName: z.string(),
          ingredients: z.array(z.string())
        }),
        execute: async (params) => {
          // Save to database
          return `Recipe saved!`;
        }
      })
    };
  }
}
```

### Cargo Bot (from earlier example)
Shipping cost calculator with image analysis:
```typescript
class CargoBot extends TelegramBot {
  async processImage(imageUrl: string, caption?: string) {
    // Use generateObject for structured extraction
    const dimensions = await generateObject({
      model: this.config.model,
      schema: cargoDimensionsSchema,
      messages: [...]
    });
    return dimensions;
  }
}
```

## Environment Variables

Required:
- `TELEGRAM_BOT_TOKEN` - Your bot token from BotFather
- `AWS_REGION` - AWS region for Bedrock
- `AWS_ACCESS_KEY_ID` - AWS credentials
- `AWS_SECRET_ACCESS_KEY` - AWS credentials
- `FUNCTION_SECRET` - Webhook security secret

Optional:
- `TAVILY_API_KEY` - For web search functionality
- `SUPABASE_URL` - If using Supabase for storage
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase auth

## Deployment

### Supabase Edge Functions

1. Deploy your bot:
```bash
supabase functions deploy my-bot --no-verify-jwt
```

2. Set webhook:
```bash
curl -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/my-bot/set-webhook?secret=YOUR_SECRET"
```

### HTML Formatting

The framework supports Telegram HTML formatting:
- `<b>bold</b>`
- `<i>italic</i>`
- `<u>underlined</u>`
- `<s>strikethrough</s>`
- `<code>monospace</code>`
- `<a href="url">links</a>`

## Best Practices

1. **System Instructions**: Always include clear instructions for TG_IMAGE and TG_CONCLUSION
2. **Error Handling**: The framework handles errors gracefully, but add specific error messages for your use case
3. **Rate Limiting**: Telegram has rate limits; the framework includes delays between messages
4. **Memory Management**: Implement proper chat history cleanup to prevent memory issues
5. **Security**: Always verify webhook secrets and sanitize user inputs

## Advanced Features

### Custom Tools
Add domain-specific AI tools:
```typescript
async getCustomTools() {
  return {
    search_database: tool({
      description: 'Search internal database',
      parameters: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        // Your implementation
        return results;
      }
    })
  };
}
```

### Persistent Storage
Implement with your preferred database:
```typescript
async loadChatHistory(userId: number, chatId: number) {
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('user_id', userId)
    .eq('chat_id', chatId)
    .order('created_at');
  return data;
}
```

### Multi-language Support
Override system instructions based on user language:
```typescript
getSystemInstructions(language: string = 'en'): string {
  const instructions = {
    'en': 'You are a helpful assistant...',
    'es': 'Eres un asistente útil...',
    'ru': 'Вы полезный помощник...'
  };
  return instructions[language] || instructions['en'];
}
```

## License

MIT License - see LICENSE file for details.