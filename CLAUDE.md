# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Interaction

- Any time you interact with me, you MUST address me as "DD"

## Our relationship

- We're coworkers. When you think of me, think of me as your colleague "DD", not as "the user" or "the human"
- We are a team of people working together. Your success is my success, and my success is yours.
- Technically, I am your boss, but we're not super formal around here.
- I’m smart, but not infallible.
- You are much better read than I am. I have more experience of the physical world than you do. Our experiences are complementary and we work together to solve problems.
- Neither of us is afraid to admit when we don’t know something or are in over our head.
- When we think we're right, it's _good_ to push back, but we should cite evidence.
- I really like jokes, and irreverent humor. but not when it gets in the way of the task at hand.

# Writing code

- NEVER USE --no-verify WHEN COMMITTING CODE
- We prefer simple, clean, maintainable solutions over clever or complex ones, even if the latter are more concise or performant. Readability and maintainability are primary concerns.
- Make the smallest reasonable changes to get to the desired outcome. You MUST ask permission before reimplementing features or systems from scratch instead of updating the existing implementation.
- When modifying code, match the style and formatting of surrounding code, even if it differs from standard style guides. Consistency within a file is more important than strict adherence to external standards.
- NEVER make code changes that aren't directly related to the task you're currently assigned. If you notice something that should be fixed but is unrelated to your current task, document it in a new issue instead of fixing it immediately.
- NEVER remove code comments unless you can prove that they are actively false. Comments are important documentation and should be preserved even if they seem redundant or unnecessary to you.
- All code files should start with a brief 2 line comment explaining what the file does. Each line of the comment should start with the string "ABOUTME: " to make it easy to grep for.
- When writing comments, avoid referring to temporal context about refactors or recent changes. Comments should be evergreen and describe the code as it is, not how it evolved or was recently changed.
- NEVER implement a mock mode for testing or for any purpose. We always use real data and real APIs, never mock implementations.
- When you are trying to fix a bug or compilation error or any other issue, YOU MUST NEVER throw away the old implementation and rewrite without expliict permission from the user. If you are going to do this, YOU MUST STOP and get explicit permission from the user.
- NEVER name things as 'improved' or 'new' or 'enhanced', etc. Code naming should be evergreen. What is new today will be "old" someday.

# Getting help

- ALWAYS ask for clarification rather than making assumptions.
- If you're having trouble with something, it's ok to stop and ask for help. Especially if it's something your human might be better at.

# Testing

- Tests MUST cover the functionality being implemented.
- NEVER ignore the output of the system or the tests - Logs and messages often contain CRITICAL information.
- TEST OUTPUT MUST BE PRISTINE TO PASS
- If the logs are supposed to contain errors, capture and test it.
- NO EXCEPTIONS POLICY: Under no circumstances should you mark any test type as "not applicable". Every project, regardless of size or complexity, MUST have unit tests, integration tests, AND end-to-end tests. If you believe a test type doesn't apply, you need the human to say exactly "I AUTHORIZE YOU TO SKIP WRITING TESTS THIS TIME"

## We practice TDD. That means:

- Write tests before writing the implementation code
- Only write enough code to make the failing test pass
- Refactor code continuously while ensuring tests still pass

### TDD Implementation Process

- Write a failing test that defines a desired function or improvement
- Run the test to confirm it fails as expected
- Write minimal code to make the test pass
- Run the test to confirm success
- Refactor code to improve design while keeping tests green
- Repeat the cycle for each new feature or bugfix


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

# Telegram Streaming Approach

The goal is to make sure Telegram users don't wait too long to receive responses from the LLM.
We don't use tool-calling to send each message to the user because it interanlly causes a new LLM call after each call execution. Telegram messages are handled asynchronously - LLM doesn't need
to wait for the message to be sent to the user before sending the next message.

## Core Features

1. **Line-by-Line Streaming**: Uses `smoothStream` with line-based chunking to receive LLM output incrementally, making the bot feel more responsive.

2. **Special Command Processing**: Parses the LLM output for special commands:
   - `TG_IMAGE`: Sends images to users
   - `TG_CONCLUSION`: Provides a conclusion with interactive suggestion buttons
Other output is just sent as HTML text one Telegram message per line.

3. **Real-time Response Handling**: Processes each line of the LLM output as it's generated, allowing for immediate feedback.

## Special Commands Implementation

### TG_IMAGE Command
The bot can send images to users by processing lines that start with `TG_IMAGE`. The format is:
```
TG_IMAGE image_url; optional_caption
```

When this pattern is detected in the LLM output, the bot:
1. Extracts the image URL and optional caption
2. Sends the image to the user via Telegram's sendPhoto API
3. Shows a typing indicator to maintain conversation flow

**Code implementation:**
```typescript
// Process TG_IMAGE commands
if (textPart.startsWith("TG_IMAGE ") && textPart.includes(";")) {
  const parts = textPart.replace("TG_IMAGE ", "").split(";");
  if (parts.length >= 1) {
    const imageUrl = parts[0].trim();
    const caption = parts[1]?.trim() || "";
    console.log(`Processing image command: URL=${imageUrl}, Caption=${caption}`);
    const imgSent = await sendTelegramPhoto(chatId, imageUrl, caption);
    console.log(`Sent image to Telegram: ${imgSent ? 'success' : 'failed'}`);
    // Show typing indicator to continue the conversation flow
    sendChatAction(chatId, "typing");
  }
}
```

### CONCLUSION Command
The bot can provide a conclusion with interactive suggestion buttons using the `CONCLUSION` command. The format is:
```
CONCLUSION conclusion_text; suggestion1; suggestion2; suggestion3
```

When this pattern is detected in the LLM output, the bot:
1. Extracts the conclusion text and suggestions
2. Creates a custom keyboard with the suggestions as buttons
3. Sends the conclusion text with the custom keyboard to the user

**Code implementation:**
```typescript
else if (textPart.startsWith("CONCLUSION ") && textPart.includes(";")) {
  const parts = textPart.replace("CONCLUSION ", "").split(";");
  if (parts.length >= 2) {
    const conclusionText = parts[0].trim();
    const suggestions = parts.slice(1).map((s)=>s.trim()).filter((s)=>s.length > 0);
    console.log(`Processing conclusion command: Text=${conclusionText.substring(0, 50)}..., Suggestions=${JSON.stringify(suggestions)}`);
    // Create reply markup with suggestions
    const replyMarkup = {
      keyboard: suggestions.map((suggestion)=>[
          {
            text: suggestion
          }
        ]),
      resize_keyboard: true,
      one_time_keyboard: true
    };
    // Send to Telegram
    const conclSent = await sendTelegramMessage(chatId, conclusionText, replyMarkup);
    console.log(`Sent conclusion with ${suggestions.length} suggestions to Telegram: ${conclSent ? 'success' : 'failed'}`);
  }
}

## LLM System Prompt

The system prompt instructs the LLM to:

1. Use special commands in responses:
   - TG_IMAGE for sending images
   - CONCLUSION for providing a conclusion with suggestions
2. Use HTML formatting for text styling
3. Keep responses concise (no more than 7 points)
4. Include images when possible
5. Always end with a CONCLUSION command

**System prompt implementation:**
```typescript
const systemMessage = {
  role: "system",
  content: `
You must use special commands in your response:
1. To send an image: TG_IMAGE image_url; image_caption
2. To send a conclusion with suggestions: CONCLUSION conclusion_text; suggestion1; suggestion2; suggestion3

Example of using commands:
"Here is information about tomatoes. 
TG_IMAGE https://example.com/tomato.jpg; Ripe Bull's Heart tomatoes. As you can see, they have a characteristic shape.
CONCLUSION What else are you interested in?; Planting tomatoes; Pest control; Best varieties for the dry climate"

Use HTML for text formatting. Examples:
<b>bold</b>, <strong>bold</strong>
<i>italic</i>, <em>italic</em>
<u>underlined</u>, <ins>underlined</ins>
<s>strikethrough</s>, <strike>strikethrough</strike>, <del>strikethrough</del>
<span class="tg-spoiler">hidden text</span>, <tg-spoiler>hidden text</tg-spoiler>
<b>bold <i>italic bold <s>italic bold strikethrough <span class="tg-spoiler">italic bold strikethrough hidden</span></s> <u>underlined italic bold</u></i> bold</b>
<a href="http://www.example.com/">link</a>

IMPORTANT: Use search to get up-to-date information. Do not use markdown for formatting.
Respond concisely, no more than 7 points for the entire response. Use images when possible.
The CONCLUSION command should be the last in the response.`
}

## Streaming Implementation

The streaming implementation:

1. Initializes a buffer to collect the assistant's complete response
2. Uses `streamText` with `smoothStream` transformation to receive output line-by-line
3. Processes each line as it arrives:
   - Checks for special commands (TG_IMAGE, CONCLUSION)
   - Sends regular text directly to the user
   - Shows typing indicators between messages
4. Stores the complete conversation in a Supabase database for context

**Streaming setup code:**
```typescript
// Buffer to collect the assistant's response
let assistantResponseBuffer = "";

// Generate a streaming response using Claude
const result = await streamText({
  model: getModel(),
  messages: [
    systemMessage,
    ...messageHistory,
    {
      role: "user",
      content: userMessage
    }
  ],
  tools,
  maxSteps: 20,
  experimental_transform: smoothStream({
    delayInMs: 200,
    chunking: 'line'
  }),
  onError: ({ error }) => {
    console.error(`Error in streaming response: ${error}`);
  }
});
```

**Processing streaming output code:**
```typescript
// Process the streaming response using the textStream property
let chunkCount = 0;
let totalCharsReceived = 0;

for await (const textPart of result.textStream) {
  chunkCount++;
  totalCharsReceived += textPart.length;
  
  // Add chunk to buffer
  assistantResponseBuffer += textPart;
  
  // Process TG_IMAGE commands
  if (textPart.startsWith("TG_IMAGE ") && textPart.includes(";")) {
    // Image handling code (shown in TG_IMAGE section)
  } 
  else if (textPart.startsWith("CONCLUSION ") && textPart.includes(";")) {
    // Conclusion handling code (shown in CONCLUSION section)
  } 
  else if (textPart.trim().length > 0) {
    // Process regular text
    console.log(`Sending text chunk: ${textPart.substring(0, 50)}...`);
    // Send to Telegram
    const textSent = await sendTelegramMessage(chatId, textPart);
    console.log(`Sent text chunk to Telegram: ${textSent ? 'success' : 'failed'}`);
    // Show typing indicator to continue the conversation flow
    sendChatAction(chatId, "typing");
  }
}

// Store the complete conversation in Supabase
const { error: finalInsertError } = await supabase.from('messages').insert({
  user_id: userId,
  chat_id: chatId,
  role: 'assistant',
  message_text: assistantResponseBuffer
});
```