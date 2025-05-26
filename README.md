# Cargo Bot - Telegram Shipping Cost Calculator

A Telegram bot that analyzes cargo images and calculates shipping costs using AI-powered dimension estimation.

## Features

- 🤖 AI-powered image analysis using Claude 3.7 Sonnet
- 📏 Automatic dimension estimation (width, length, height)
- ⚖️ Weight estimation based on cargo type
- 💰 Instant shipping cost calculation
- 🇷🇺 Russian language interface
- 📸 Support for both compressed photos and image files

## How It Works

1. User sends a photo of their cargo
2. Bot analyzes the image using Claude AI
3. Dimensions and weight are estimated
4. Shipping cost is calculated using the formula: `max(width × length × height × 1000, weight)`
5. User receives detailed breakdown and cost estimate

## Getting Started

### Prerequisites

- [Deno](https://deno.land/) runtime
- Supabase account
- AWS account with Bedrock access
- Telegram Bot Token

### Environment Variables

Configure these in your Supabase project:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
CARGO_BOT_API_TOKEN=your_telegram_bot_token
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
FUNCTION_SECRET=your_webhook_secret
```

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/cargo-telegram-bot.git
cd cargo-telegram-bot
```

2. Start Supabase locally:
```bash
supabase start
```

3. Deploy the function locally:
```bash
supabase functions serve cargo --env-file ./supabase/.env.local
```

### Deployment

Deploy to Supabase:
```bash
supabase functions deploy cargo
```

Set up the Telegram webhook:
```bash
curl -X POST "https://<your-project>.supabase.co/functions/v1/cargo/set-webhook?secret=<FUNCTION_SECRET>"
```

## Usage

1. Start a conversation with your bot on Telegram
2. Send `/start` to see instructions
3. Send a photo of your cargo
4. Receive dimension analysis and cost estimate

## Bot Commands

- `/start` - Welcome message and instructions

## Cost Calculation Formula

The shipping cost is calculated as:

```
Cost = max(Volume Cost, Weight Cost)

Where:
- Volume Cost = Width(m) × Length(m) × Height(m) × 1000
- Weight Cost = Weight(kg)
```

## Example Usage

1. Send `/start` to the bot
2. Send a photo of your cargo
3. Receive dimension analysis and cost estimate
4. Get packaging tips or contact support

## Technical Stack

- **Runtime**: Deno (Supabase Edge Functions)
- **AI Model**: Claude 3.7 Sonnet via AWS Bedrock
- **Language**: TypeScript
- **Bot Platform**: Telegram Bot API

## Project Structure

```
supabase/
└── functions/
    └── cargo/
        └── index.ts    # Main bot logic
```

## Testing

The bot includes error handling for:
- Invalid images
- Network failures
- AI processing errors

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues and feature requests, please use the [GitHub Issues](https://github.com/yourusername/cargo-telegram-bot/issues) page.