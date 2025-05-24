# BRDist - Business Requirements Document Assistant

## Overview

BRDist is a Telegram bot that helps users create comprehensive Business Requirements Documents (BRDs) and project specifications through conversational AI. It guides users through the idea development process by asking targeted questions and collecting structured information.

## Key Features

- **Dynamic Question Generation**: Uses Claude AI to generate contextually relevant questions based on the user's project idea
- **Keyboard Suggestions**: Provides pre-defined answer choices via Telegram's inline keyboard for better UX
- **BRD Creation**: Generates structured Business Requirements Documents from collected information
- **Spec Generation**: Creates detailed project specifications including technical architecture and implementation details
- **Persistent Sessions**: Maintains conversation context across multiple interactions
- **Testable Architecture**: Uses adapter pattern for both Telegram API and data persistence

## Commands

- `/start` - Begin a new BRD session
- `/spec` - Generate a comprehensive project specification from current session data
- Standard responses work naturally in conversation

## Architecture

### Adapter Pattern
The bot uses adapter patterns for testability:
- **TelegramAdapter**: Abstracts Telegram API calls (production vs test implementations)
- **DatastoreAdapter**: Abstracts data persistence (Supabase vs in-memory implementations)

### Data Models
- **Messages**: Stores all conversation messages
- **BRD Sessions**: Tracks BRD creation sessions with accumulated context
- **Specs**: Stores generated project specifications with versioning

## Special Claude Commands

When generating responses, Claude can use these special commands:
- `CHOICES[option1|option2|option3]` - Present multiple choice options to the user
- `BRD_UPDATE{json}` - Update the accumulated BRD data
- `BRD_COMPLETE` - Mark the BRD as complete and generate final document

## Testing

Run tests with:
```bash
deno test --allow-net --allow-env
```

Tests use in-memory adapters to avoid external dependencies.

## Development Commands

- Lint: `deno lint`
- Format: `deno fmt`
- Type check: `deno check index.ts`

## Database Schema

The bot requires these Supabase tables:
- `messages` - Conversation history
- `brd_sessions` - BRD session tracking
- `specs` - Generated specifications
- `spec_versions` - Automatic versioning for specs

Run the migration script in `/supabase/migrations/20240101000001_create_brdist_tables.sql` to create all required tables.

## Environment Variables

- `TELEGRAM_BOT_TOKEN` - Telegram bot API token
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `AWS_REGION` - AWS region for Bedrock
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key