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