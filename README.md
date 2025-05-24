# BRDist - Business Requirements Document Telegram Bot

BRDist is a Telegram bot that helps create comprehensive Business Requirements Documents (BRDs) through an intelligent conversational interface powered by Claude AI.

## Features

- **Dynamic Question Flow**: AI-driven questions that adapt based on your project needs
- **Intelligent Guidance**: Powered by AWS Bedrock with Claude 3.7 Sonnet
- **Keyboard Suggestions**: Multiple-choice questions with easy-to-use buttons
- **Session Management**: Tracks progress and saves your BRD data
- **Document Generation**: Creates professional BRD documents on demand
- **Flexible Architecture**: Supports both production and test environments

## Getting Started

### Prerequisites

- [Deno](https://deno.land/) runtime
- Supabase account
- AWS account with Bedrock access
- Telegram Bot Token
- Tavily API key for web search capabilities

### Environment Variables

Create a `.env.local` file with:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
AWS_REGION=your_aws_region
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
TAVILY_API_KEY=your_tavily_api_key
FUNCTION_SECRET=your_webhook_secret
```

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/brdist-telegram-bot.git
cd brdist-telegram-bot
```

2. Start Supabase locally:
```bash
supabase start
```

3. Run database migrations:
```bash
supabase db push
```

4. Deploy the function locally:
```bash
supabase functions serve brdist --env-file ./supabase/.env.local
```

### Deployment

Deploy to Supabase:
```bash
supabase functions deploy brdist
```

Set up the Telegram webhook:
```
https://<your-project>.supabase.co/functions/v1/brdist?secret=<FUNCTION_SECRET>
```

## Usage

1. Start a conversation with your bot on Telegram
2. Send `/start` to begin a new BRD session
3. Answer the AI-generated questions about your project
4. Use `/generate` to create your final BRD document

## Architecture

BRDist uses a clean architecture with adapter patterns for flexibility:

- **TelegramAdapter**: Handles Telegram API interactions
- **DatastoreAdapter**: Manages data persistence
- **Claude AI Integration**: Dynamic question generation and document creation
- **Supabase Edge Functions**: Serverless webhook handler

## Testing

Run unit tests:
```bash
cd supabase/functions/brdist
deno task test
```

Run integration tests (requires AWS credentials):
```bash
RUN_INTEGRATION_TESTS=true deno task test:integration
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues and feature requests, please use the [GitHub Issues](https://github.com/yourusername/brdist-telegram-bot/issues) page.