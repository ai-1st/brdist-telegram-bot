// ABOUTME: Main entry point for the generic Telegram bot Supabase edge function
// ABOUTME: Handles webhook setup, message processing, and CORS for browser requests

import { 
  loadBotConfig, 
  getChatHistory, 
  addMessageToHistory, 
  clearChatHistory,
  personalizeWelcomeMessage,
  personalizeHelpMessage,
  upsertTelegramUser,
  getWebtoolsForBot,
  type BotConfig,
  type ChatMessage
} from './dal.ts';
import { 
  reply, 
  processImageWithLLM, 
  getFileUrl 
} from './reply.ts';

// Telegram message types
interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
    is_bot: boolean;
    language_code?: string;
  };
  chat: {
    id: number;
    type: string;
  };
  text?: string;
  photo?: Array<{
    file_id: string;
    file_unique_id: string;
    file_size?: number;
    width?: number;
    height?: number;
  }>;
  document?: {
    file_id: string;
    file_unique_id: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
  };
  caption?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

// CORS headers for browser requests
function getCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Referer')?.split('/').slice(0, 3).join('/')
  return {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma, Referer',
    'Access-Control-Allow-Origin': origin || '*',
    'Content-Type': 'application/json'
  };
}

// Handle preflight OPTIONS requests
function handlePreflight(request: Request): Response {
  return new Response("{}", {
    status: 200,
    headers: getCorsHeaders(request)
  });
}

// Send message to Telegram (simple version for commands)
async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string
): Promise<boolean> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "HTML"
      })
    });
    
    const result = await response.json();
    return result.ok;
  } catch (error) {
    console.error(`Error sending message: ${error}`);
    return false;
  }
}

// Send chat action (typing indicator)
async function sendChatAction(
  botToken: string,
  chatId: number,
  action: string = "typing"
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendChatAction`;
  
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        action: action
      })
    });
  } catch (error) {
    console.error(`Error sending chat action: ${error}`);
  }
}

// Standard system prompt for Telegram bot commands and formatting
const STANDARD_SYSTEM_PROMPT = `

You must use special commands in your response:
1. To send an image: TG_IMAGE image_url; image_caption
2. To send a conclusion with suggestions: TG_CONCLUSION conclusion_text; suggestion1; suggestion2; suggestion3

Example of using commands:
"Here is information about tomatoes. 
TG_IMAGE https://example.com/tomato.jpg; Ripe Bull's Heart tomatoes. As you can see, they have a characteristic shape.
TG_CONCLUSION What else are you interested in?; Planting tomatoes; Pest control; Best varieties for the dry climate"

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
The TG_CONCLUSION command should be the last in the response.`;

// Combine bot's custom system prompt with standard Telegram formatting instructions
function buildSystemPrompt(botSystemPrompt: string): string {
  return botSystemPrompt + STANDARD_SYSTEM_PROMPT;
}

// Handle /start command
async function handleStartCommand(
  message: TelegramMessage,
  botConfig: BotConfig
): Promise<void> {
  const welcomeMessage = personalizeWelcomeMessage(
    botConfig.welcome_message,
    botConfig.name,
    message.from.first_name
  );
  
  await sendTelegramMessage(
    botConfig.tg_token,
    message.chat.id,
    welcomeMessage
  );
  
  // Clear chat history on /start
  await clearChatHistory(
    message.from.id,
    message.chat.id.toString(),
    botConfig.id
  );
}

// Handle /help command
async function handleHelpCommand(
  message: TelegramMessage,
  botConfig: BotConfig
): Promise<void> {
  const helpMessage = personalizeHelpMessage(
    botConfig.help_message,
    botConfig.name
  );
  
  await sendTelegramMessage(
    botConfig.tg_token,
    message.chat.id,
    helpMessage
  );
}

// Handle /clear command
async function handleClearCommand(
  message: TelegramMessage,
  botConfig: BotConfig
): Promise<void> {
  await clearChatHistory(
    message.from.id,
    message.chat.id.toString(),
    botConfig.id
  );
  
  await sendTelegramMessage(
    botConfig.tg_token,
    message.chat.id,
    "✨ Conversation history cleared! Let's start fresh."
  );
}

// Process message (text or image)
async function processMessage(
  message: TelegramMessage,
  botConfig: BotConfig
): Promise<void> {
  const userId = message.from.id;
  const chatId = message.chat.id;
  const chatIdStr = chatId.toString();
  
  // Handle commands
  if (message.text?.startsWith("/")) {
    switch (message.text) {
      case "/start":
        await handleStartCommand(message, botConfig);
        return;
      case "/help":
        await handleHelpCommand(message, botConfig);
        return;
      case "/clear":
        await handleClearCommand(message, botConfig);
        return;
      default:
        await sendTelegramMessage(
          botConfig.tg_token,
          chatId,
          "Unknown command. Try /help to see available commands."
        );
        return;
    }
  }
  
  // Upsert Telegram user
  await upsertTelegramUser(userId, botConfig.user_email, message.from);
  
  try {
    // Handle image messages
    if (message.photo || (message.document?.mime_type?.startsWith('image/'))) {
      await sendTelegramMessage(
        botConfig.tg_token,
        chatId,
        "🔍 Analyzing image..."
      );
      
      const fileId = message.photo 
        ? message.photo[message.photo.length - 1].file_id
        : message.document!.file_id;
      
      const imageUrl = await getFileUrl(botConfig.tg_token, fileId);
      if (!imageUrl) {
        await sendTelegramMessage(
          botConfig.tg_token,
          chatId,
          "Sorry, I couldn't access the image. Please try again."
        );
        return;
      }
      
      // Send typing indicator before LLM call
      await sendChatAction(botConfig.tg_token, chatId);
      
      // Load webtools for this bot
      const webtools = await getWebtoolsForBot(botConfig.id);
      
      // Process image and get response
      const imageResponse = await processImageWithLLM(
        imageUrl,
        message.caption || "Please analyze this image.",
        buildSystemPrompt(botConfig.system_prompt),
        {
          botApiKey: botConfig.tg_token,
          chatId: chatId,
          tavilyApiKey: Deno.env.get('TAVILY_API_KEY'),
          systemPrompt: buildSystemPrompt(botConfig.system_prompt),
          webtools: webtools
        }
      );
      
      // Save messages to history
      await addMessageToHistory({
        user_id: userId,
        chat_id: chatIdStr,
        role: 'user',
        message_text: message.caption || '[Image uploaded]',
        bot_id: botConfig.id,
        user_email: botConfig.user_email
      });
      
      await addMessageToHistory({
        user_id: userId,
        chat_id: chatIdStr,
        role: 'assistant',
        message_text: imageResponse,
        bot_id: botConfig.id,
        user_email: botConfig.user_email
      });
      
    } else if (message.text) {
      // Handle text messages
      
      // Load chat history
      const history = await getChatHistory(userId, chatIdStr, botConfig.id);
      
      // Add current message to history
      const messages: ChatMessage[] = [
        ...history,
        {
          role: 'user',
          content: message.text
        }
      ];
      
      // Save user message
      await addMessageToHistory({
        user_id: userId,
        chat_id: chatIdStr,
        role: 'user',
        message_text: message.text,
        bot_id: botConfig.id,
        user_email: botConfig.user_email
      });
      
      // Send typing indicator before LLM call
      await sendChatAction(botConfig.tg_token, chatId);
      
      // Load webtools for this bot
      const webtools = await getWebtoolsForBot(botConfig.id);
      
      // Generate and stream response
      const assistantResponse = await reply(
        {
          botApiKey: botConfig.tg_token,
          chatId: chatId,
          tavilyApiKey: Deno.env.get('TAVILY_API_KEY'),
          systemPrompt: buildSystemPrompt(botConfig.system_prompt),
          webtools: webtools
        },
        messages
      );
      
      // Save assistant response
      await addMessageToHistory({
        user_id: userId,
        chat_id: chatIdStr,
        role: 'assistant',
        message_text: assistantResponse,
        bot_id: botConfig.id,
        user_email: botConfig.user_email
      });
    }
    
  } catch (error) {
    console.error('Error processing message:', error);
    await sendTelegramMessage(
      botConfig.tg_token,
      chatId,
      "Sorry, I encountered an error processing your message. Please try again."
    );
  }
}

// Handle webhook requests from Telegram
async function handleWebhook(request: Request): Promise<Response> {
  try {
    console.log(`[handleWebhook] Starting webhook processing at ${new Date().toISOString()}`);
    
    // Extract secret from URL
    const url = new URL(request.url);
    const secretString = url.searchParams.get("secret");
    
    if (!secretString) {
      console.error('[handleWebhook] No secret provided in webhook URL');
      return new Response("OK", { status: 200 });
    }
    
    // Load bot configuration
    const botConfig = await loadBotConfig(secretString);
    if (!botConfig) {
      console.error('[handleWebhook] Bot not found for secret:', secretString.substring(0, 8));
      return new Response("OK", { status: 200 });
    }
    
    console.log(`[handleWebhook] Bot found: ${botConfig.name} (ID: ${botConfig.id})`);
    
    // Parse webhook data
    const update: TelegramUpdate = await request.json();
    
    // Process message if present
    if (update.message) {        
      /*
      https://supabase.com/docs/guides/functions/background-tasks
      You can use EdgeRuntime.waitUntil(promise) to explicitly mark 
      background tasks. The Function instance continues to run until 
      the promise provided to waitUntil completes.
      */
      // Process message asynchronously without waiting
      processMessage(update.message, botConfig);
    }
    
    console.log('[handleWebhook] Webhook processing is handled in background');
    return new Response("OK", { status: 200 });
    
  } catch (error) {
    console.error('[handleWebhook] Unexpected error:', error);
    // Always return 200 to Telegram even in case of errors
    return new Response("OK", { status: 200 });
  }
}

// Handle set-webhook requests
async function handleSetWebhook(request: Request): Promise<Response> {
  const headers = getCorsHeaders(request);
  
  console.log('\n[SET-WEBHOOK] Starting webhook setup process');
  
  try {
    const url = new URL(request.url);
    const secretString = url.searchParams.get("secret");
    
    if (!secretString) {
      console.log('[SET-WEBHOOK] ERROR: No secret provided');
      return new Response(JSON.stringify({
        success: false,
        error: "No secret provided"
      }), {
        status: 400,
        headers
      });
    }
    
    // Load bot configuration
    const botConfig = await loadBotConfig(secretString);
    if (!botConfig || !botConfig.tg_token) {
      console.log('[SET-WEBHOOK] ERROR: Bot not found or missing token');
      return new Response(JSON.stringify({
        success: false,
        error: "Bot or telegram token not found"
      }), {
        status: 404,
        headers
      });
    }
    
    console.log(`[SET-WEBHOOK] Bot found: ${botConfig.name}`);
    
    // Get Supabase URL to construct webhook URL
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!supabaseUrl) {
      console.log('[SET-WEBHOOK] ERROR: SUPABASE_URL not set');
      return new Response(JSON.stringify({
        success: false,
        error: "Missing SUPABASE_URL"
      }), {
        status: 500,
        headers
      });
    }
    
    // Extract project ref from Supabase URL
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
    if (!projectRef) {
      console.log('[SET-WEBHOOK] ERROR: Could not extract project reference');
      return new Response(JSON.stringify({
        success: false,
        error: "Could not extract project reference from SUPABASE_URL"
      }), {
        status: 500,
        headers
      });
    }
    
    // Construct webhook URL
    const webhookUrl = `https://${projectRef}.supabase.co/functions/v1/generic-bot?secret=${secretString}`;
    console.log(`[SET-WEBHOOK] Webhook URL: ${webhookUrl}`);
    
    // Set webhook via Telegram API
    const telegramUrl = `https://api.telegram.org/bot${botConfig.tg_token}/setWebhook`;
    const response = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl })
    });
    
    const result = await response.json();
    console.log(`[SET-WEBHOOK] Telegram response:`, result);
    
    if (result.ok) {
      console.log(`[SET-WEBHOOK] ✅ Webhook set successfully`);
    } else {
      console.log(`[SET-WEBHOOK] ❌ Failed to set webhook`);
    }
    
    return new Response(JSON.stringify({
      success: result.ok,
      webhook_url: webhookUrl,
      bot_name: botConfig.name,
      telegram_response: result
    }), {
      status: result.ok ? 200 : 400,
      headers
    });
    
  } catch (error) {
    console.error('[SET-WEBHOOK] EXCEPTION:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers
    });
  }
}

// Main server
console.log('Starting generic-bot server...');

if (import.meta.main) {
  Deno.serve(async (request) => {
    console.log(`\n[REQUEST] ${new Date().toISOString()}`);
    console.log(`[REQUEST] Method: ${request.method}`);
    console.log(`[REQUEST] URL: ${request.url}`);
    
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    try {
      // Handle preflight OPTIONS requests
      if (request.method === 'OPTIONS') {
        return handlePreflight(request);
      }
      
      // Handle set-webhook endpoint
      if (pathname.endsWith('/set-webhook')) {
        return await handleSetWebhook(request);
      }
      
      // Handle webhook (POST requests)
      if (request.method === 'POST') {
        return await handleWebhook(request);
      }
      
      // Method not allowed
      return new Response(JSON.stringify({
        error: "Method not allowed"
      }), {
        status: 405,
        headers: getCorsHeaders(request)
      });
      
    } catch (error) {
      console.error('Server error:', error);
      return new Response(JSON.stringify({
        error: "Internal Server Error"
      }), {
        status: 500,
        headers: getCorsHeaders(request)
      });
    }
  });
}