# Webtools Integration for Generic Bot

This document explains how the generic-bot now supports dynamic webtools loaded from the database.

## Overview

The generic-bot can now dynamically load and use webtools stored in the `webtools` table. These webtools are converted to Vercel AI SDK tools and made available to the LLM during conversations.

## How It Works

1. **Database Storage**: Webtools are stored in the `webtools` table with the following structure:
   ```sql
   CREATE TABLE public.webtools (
     id uuid NOT NULL DEFAULT gen_random_uuid(),
     user_email text NOT NULL,
     bot_id uuid NOT NULL,
     name text NOT NULL,
     url text NOT NULL,
     description text DEFAULT ''::text,
     context_config jsonb DEFAULT '{}'::jsonb,
     is_enabled boolean DEFAULT true,
     created_at timestamp with time zone DEFAULT now(),
     updated_at timestamp with time zone DEFAULT now()
   );
   ```

2. **Metadata Discovery**: When a bot starts processing a message, it:
   - Fetches all enabled webtools for the bot from the database
   - Makes GET requests to each webtool URL to fetch metadata
   - Converts each webtool action into a Vercel AI SDK tool

3. **Tool Execution**: When the LLM decides to use a webtool:
   - The appropriate action is called with the provided parameters
   - A POST request is made to the webtool URL with the action and payload
   - The response is returned to the LLM for processing

## Adding a Webtool to a Bot

To add a webtool to your bot, insert a record into the `webtools` table:

```sql
INSERT INTO webtools (
  user_email,
  bot_id,
  name,
  url,
  description,
  context_config,
  is_enabled
) VALUES (
  'user@example.com',
  'your-bot-id-here',
  'weather',
  'https://your-webtool-url.com',
  'Get weather information for any location',
  '{"defaultUnits": "metric"}',
  true
);
```

## Webtool Interface Requirements

Your webtool must implement the standard interface:

### GET Request - Metadata
Returns information about available actions:
```json
{
  "name": "weather",
  "description": "Get weather information",
  "actions": [
    {
      "name": "current",
      "description": "Get current weather",
      "schema": {
        "type": "object",
        "properties": {
          "location": { "type": "string" }
        },
        "required": ["location"]
      }
    }
  ]
}
```

### POST Request - Execute Action
Executes the specified action:
```json
{
  "session_id": "bot-123-456",
  "action": "current",
  "config": { "defaultUnits": "metric" },
  "payload": { "location": "New York" }
}
```

## Example Webtool

See `_shared/example-webtool.ts` for a complete example implementation.

## Testing

1. Deploy the example webtool:
   ```bash
   cd supabase/functions/_shared
   deno run --allow-net example-webtool.ts
   ```

2. Add it to your bot in the database:
   ```sql
   INSERT INTO webtools (user_email, bot_id, name, url, description)
   VALUES ('your-email', 'your-bot-id', 'weather', 'http://localhost:8000', 'Weather information');
   ```

3. Chat with your bot and ask about weather!

## Limitations

- JSON Schema to Zod conversion is simplified to avoid type depth issues
- Complex nested schemas may not be fully validated
- Webtools must respond quickly to avoid timeouts
- Each webtool action becomes a separate tool in the LLM context

## Security Considerations

- Only enable webtools from trusted sources
- Webtools can access any data sent in the payload
- Consider implementing authentication for sensitive webtools
- Review the `context_config` to ensure no sensitive data is stored