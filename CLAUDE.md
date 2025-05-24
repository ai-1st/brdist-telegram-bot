# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Supabase-based Telegram bot project for creating Business Requirements Documents (BRDs). The bot is named **BRDist** and:
- Guides users through a dynamic BRD creation process using Claude AI
- Uses AWS Bedrock with Claude Sonnet for intelligent question generation
- Manages BRD sessions with state tracking via adapter pattern
- Provides keyboard suggestions for multiple-choice questions
- Generates comprehensive BRD documents on demand
- Supports both production (Supabase) and in-memory datastores for testing

## Key Architecture

### Supabase Edge Function
- **Location**: `/supabase/functions/brdist/index.ts`
- **Runtime**: Deno edge runtime
- **Model**: AWS Bedrock Claude 3.7 Sonnet (`us.anthropic.claude-3-7-sonnet-20250219-v1:0`)
- **Purpose**: Webhook handler for Telegram bot messages

### Adapter Pattern Architecture
The bot uses adapter patterns for testability:
1. **TelegramAdapter**: Interface for Telegram API calls
   - `ProductionTelegramAdapter`: Makes real API calls
   - `TestTelegramAdapter`: Collects calls for testing
2. **DatastoreAdapter**: Interface for data persistence
   - `SupabaseDatastoreAdapter`: Uses Supabase for production
   - `InMemoryDatastoreAdapter`: Uses in-memory storage for testing

### Database Schema
The function expects two tables:

1. `messages` table with columns:
   - `user_id`: Telegram user ID
   - `chat_id`: Telegram chat ID
   - `role`: Message role ('user' or 'assistant')
   - `message_text`: The message content
   - `created_at`: Timestamp (for ordering)

2. `brd_sessions` table with columns:
   - `id`: Session ID
   - `user_id`: Telegram user ID
   - `chat_id`: Telegram chat ID
   - `status`: Session status ('active', 'completed', 'exported')
   - `current_step`: Current question step in BRD flow
   - `brd_data`: JSONB field storing all collected BRD data
   - `created_at`: Timestamp

### Dynamic BRD Flow
The bot uses Claude AI to dynamically generate questions based on the conversation context. Key areas covered include:
- Project type and description
- Target audience
- Project scale and timeline
- Budget considerations
- Key features and requirements
- Technical specifications
- Integration needs
- Compliance requirements
- Success metrics
- Additional information

Claude uses special commands:
- `CHOICES question; option1; option2...` - Creates keyboard options
- `BRD_UPDATE key:value` - Stores collected data
- `BRD_COMPLETE` - Marks data collection as complete

### Bot Commands
- `/start` - Begins a new BRD session
- `/generate` - Creates the final BRD document (only available after completing all questions)

## Development Commands

### Local Development
```bash
# Start Supabase locally
supabase start

# Deploy function locally
supabase functions serve brdist --env-file ./supabase/.env.local

# Deploy to Supabase
supabase functions deploy brdist

# Run tests
cd supabase/functions/brdist
deno task test

# Run integration tests (requires real AWS credentials)
deno task test:integration
```

### Environment Variables Required
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for database access
- `BRDIST_BOT_API_TOKEN` - Telegram bot token
- `AWS_REGION` - AWS region for Bedrock
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- `TAVILY_API_KEY` - Tavily API key for web search
- `FUNCTION_SECRET` - Secret for webhook authentication

### Webhook Setup
The Telegram webhook should be set to:
```
https://<your-project>.supabase.co/functions/v1/brdist?secret=<FUNCTION_SECRET>
```

### Testing
The project includes comprehensive tests using Deno's built-in test framework:
- Unit tests for all adapters and core functionality
- Integration tests for end-to-end BRD generation (requires AWS credentials)
- Test adapters enable testing without external dependencies

To run tests locally:
```bash
# Install Deno if not already installed
curl -fsSL https://deno.land/x/install/install.sh | sh

# Run unit tests
cd supabase/functions/brdist
deno task test

# Run with integration tests
RUN_INTEGRATION_TESTS=true deno task test:integration
```

## Important Implementation Details

1. **Session Management**: Each user/chat combination has its own BRD session tracking progress through the question flow.

2. **Keyboard Suggestions**: Multiple-choice questions automatically display Telegram keyboard buttons for easy selection.

3. **Claude Integration**: Used for dynamic question generation and BRD document creation. Claude dynamically decides what questions to ask based on context.

4. **State Persistence**: All BRD data is stored in JSONB format in the `brd_sessions` table.

5. **HTML Formatting**: Uses Telegram HTML formatting for rich text in messages and BRD output.

6. **Message Chunking**: Long BRD documents are automatically split into 4000-character chunks for Telegram's limits.

7. **Error Handling**: Comprehensive error logging and user-friendly error messages.

8. **Cleanup on Start**: `/start` command cleans up previous sessions and messages for a fresh start.