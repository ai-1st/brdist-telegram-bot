import { 
  loadBotConfig, 
  getChatHistory, 
  addMessageToHistory, 
  clearChatHistory,
  type BotConfig,
  type Message 
} from './dal.ts';
import { createCorsJsonResponse } from './index.ts';
import { 
  sendTelegramMessage, 
  sendChatAction, 
  getFileUrl, 
  setWebhook,
  processStreamLine,
  type TelegramMessage 
} from './telegram.ts';
import { 
  generateResponse, 
  processImageWithLLM, 
  messagesToChatMessages,
  personalizeWelcomeMessage,
  personalizeHelpMessage,
  type LLMConfig 
} from './llm.ts';

function getLLMConfig(): LLMConfig {
  return {
    awsRegion: Deno.env.get('AWS_REGION'),
    awsAccessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
    awsSecretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY'),
    tavilyApiKey: Deno.env.get('TAVILY_API_KEY'),
    streamingDelayMs: 200
  };
}

async function handleStartCommand(
  message: TelegramMessage, 
  botConfig: BotConfig
): Promise<void> {
  if (!botConfig.tg_token) {
    console.error('No telegram token found for bot');
    return;
  }

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
  await clearChatHistory(message.from.id, message.chat.id, botConfig.id);
}

async function handleHelpCommand(
  message: TelegramMessage, 
  botConfig: BotConfig
): Promise<void> {
  if (!botConfig.tg_token) return;

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

async function handleClearCommand(
  message: TelegramMessage, 
  botConfig: BotConfig
): Promise<void> {
  if (!botConfig.tg_token) return;

  await clearChatHistory(message.from.id, message.chat.id, botConfig.id);
  await sendTelegramMessage(
    botConfig.tg_token, 
    message.chat.id, 
    "✨ Conversation history cleared! Let's start fresh."
  );
}

async function handleImageMessage(
  message: TelegramMessage, 
  botConfig: BotConfig
): Promise<void> {
  if (!botConfig.tg_token) return;

  const chatId = message.chat.id;
  const userId = message.from.id;

  try {
    // Send initial acknowledgment
    await sendTelegramMessage(
      botConfig.tg_token, 
      chatId, 
      "🔍 Analyzing image..."
    );
    await sendChatAction(botConfig.tg_token, chatId);

    // Get the largest photo
    const photoArray = message.photo;
    if (!photoArray || photoArray.length === 0) {
      await sendTelegramMessage(
        botConfig.tg_token, 
        chatId, 
        "Sorry, I couldn't process the image. Please try again."
      );
      return;
    }

    const largestPhoto = photoArray[photoArray.length - 1];
    const fileId = largestPhoto.file_id;

    // Get file URL from Telegram
    const fileUrl = await getFileUrl(botConfig.tg_token, fileId);
    if (!fileUrl) {
      await sendTelegramMessage(
        botConfig.tg_token, 
        chatId, 
        "Sorry, I couldn't access the image. Please try again."
      );
      return;
    }

    // Process image with LLM
    const imageResponse = await processImageWithLLM(
      fileUrl,
      message.caption || "Please analyze this image.",
      botConfig.system_prompt,
      getLLMConfig()
    );

    // Save user message to history
    await addMessageToHistory({
      user_id: userId,
      chat_id: chatId,
      role: 'user',
      message_text: message.caption || '[Image uploaded]',
      bot_id: botConfig.id
    });

    // Process and send response
    await processResponseLines(imageResponse, botConfig.tg_token, chatId);

    // Save assistant response to history
    await addMessageToHistory({
      user_id: userId,
      chat_id: chatId,
      role: 'assistant',
      message_text: imageResponse,
      bot_id: botConfig.id
    });

  } catch (error) {
    console.error('Error processing image:', error);
    await sendTelegramMessage(
      botConfig.tg_token, 
      chatId, 
      "Sorry, I encountered an error processing the image. Please try again."
    );
  }
}

async function handleTextMessage(
  message: TelegramMessage, 
  botConfig: BotConfig
): Promise<void> {
  if (!botConfig.tg_token || !message.text) return;

  const chatId = message.chat.id;
  const userId = message.from.id;

  try {
    // Show typing indicator
    await sendChatAction(botConfig.tg_token, chatId);

    // Load chat history
    const history = await getChatHistory(userId, chatId, botConfig.id);
    
    // Convert to chat messages format
    const chatMessages = messagesToChatMessages(history, botConfig.system_prompt);
    
    // Add current message
    chatMessages.push({
      role: 'user',
      content: message.text
    });

    // Save user message to history
    await addMessageToHistory({
      user_id: userId,
      chat_id: chatId,
      role: 'user',
      message_text: message.text,
      bot_id: botConfig.id
    });

    // Generate response
    let responseBuffer = "";
    let lineBuffer = "";
    
    for await (const textPart of generateResponse(chatMessages, getLLMConfig())) {
      responseBuffer += textPart;
      lineBuffer += textPart;
      
      // Process complete lines
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || "";
      
      for (const line of lines) {
        processStreamLine(line.trim(), botConfig.tg_token, chatId);
      }
    }
    
    // Process any remaining content
    if (lineBuffer.trim()) {
      processStreamLine(lineBuffer.trim(), botConfig.tg_token, chatId);
    }

    // Save assistant response to history
    await addMessageToHistory({
      user_id: userId,
      chat_id: chatId,
      role: 'assistant',
      message_text: responseBuffer,
      bot_id: botConfig.id
    });

  } catch (error) {
    console.error('Error processing text message:', error);
    await sendTelegramMessage(
      botConfig.tg_token, 
      chatId, 
      "Sorry, I encountered an error processing your message. Please try again."
    );
  }
}

async function processResponseLines(
  response: string, 
  botToken: string, 
  chatId: number
): Promise<void> {
  const lines = response.split('\n');
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine) {
      processStreamLine(trimmedLine, botToken, chatId);
      // Small delay between lines to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

export async function handleWebhook(request: Request): Promise<Response> {
  try {
    // Extract secret from URL
    const url = new URL(request.url);
    const secretString = url.searchParams.get("secret");
    
    if (!secretString) {
      console.error('No secret provided in webhook URL');
      return new Response("Unauthorized", { status: 401 });
    }

    // Load bot configuration
    const botConfig = await loadBotConfig(secretString);
    if (!botConfig) {
      console.error('Bot not found for secret:', secretString);
      return new Response("Bot not found", { status: 404 });
    }

    console.log(`Processing webhook for bot: ${botConfig.name}`);

    // Parse webhook data
    const update = await request.json();
    const message: TelegramMessage = update.message;
    
    if (!message) {
      return new Response("OK", { status: 200 });
    }

    // Handle commands
    if (message.text?.startsWith("/")) {
      switch (message.text) {
        case "/start":
          await handleStartCommand(message, botConfig);
          break;
        case "/help":
          await handleHelpCommand(message, botConfig);
          break;
        case "/clear":
          await handleClearCommand(message, botConfig);
          break;
        default:
          if (botConfig.tg_token) {
            await sendTelegramMessage(
              botConfig.tg_token,
              message.chat.id,
              "Unknown command. Use /help to see available commands."
            );
          }
          break;
      }
    }
    // Handle images
    else if (message.photo || (message.document?.mime_type?.startsWith('image/'))) {
      await handleImageMessage(message, botConfig);
    }
    // Handle text messages
    else if (message.text) {
      await handleTextMessage(message, botConfig);
    }

    return new Response("OK", { status: 200 });

  } catch (error) {
    console.error('Error handling webhook:', error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

export async function handleSetWebhook(request: Request): Promise<Response> {
  console.log('\n[SET-WEBHOOK] Starting webhook setup process');
  
  try {
    const url = new URL(request.url);
    const secretString = url.searchParams.get("secret");
    
    console.log(`[SET-WEBHOOK] Secret parameter: ${secretString ? 'provided' : 'missing'}`);
    
    if (!secretString) {
      console.log('[SET-WEBHOOK] ERROR: No secret provided in URL parameters');
      return createCorsJsonResponse({
        success: false,
        error: "No secret provided"
      }, 400);
    }

    console.log(`[SET-WEBHOOK] Loading bot configuration for secret: ${secretString.substring(0, 8)}...`);
    
    // Load bot configuration
    const botConfig = await loadBotConfig(secretString);
    if (!botConfig || !botConfig.tg_token) {
      console.log(`[SET-WEBHOOK] ERROR: Bot not found or missing Telegram token for secret: ${secretString.substring(0, 8)}...`);
      return createCorsJsonResponse({
        success: false,
        error: "Bot or telegram token not found"
      }, 404);
    }

    console.log(`[SET-WEBHOOK] Bot found: ${botConfig.name} (ID: ${botConfig.id})`);
    console.log(`[SET-WEBHOOK] Telegram token: ${botConfig.tg_token?.substring(0, 10)}...`);

    // Get Supabase URL to construct webhook URL
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    console.log(`[SET-WEBHOOK] Supabase URL: ${supabaseUrl ? 'configured' : 'missing'}`);
    
    if (!supabaseUrl) {
      console.log('[SET-WEBHOOK] ERROR: SUPABASE_URL environment variable not set');
      return createCorsJsonResponse({
        success: false,
        error: "Missing SUPABASE_URL"
      }, 500);
    }

    // Extract project ref from Supabase URL
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
    console.log(`[SET-WEBHOOK] Project reference extracted: ${projectRef || 'failed'}`);
    
    if (!projectRef) {
      console.log(`[SET-WEBHOOK] ERROR: Could not extract project reference from URL: ${supabaseUrl}`);
      return createCorsJsonResponse({
        success: false,
        error: "Could not extract project reference from SUPABASE_URL"
      }, 500);
    }

    // Construct webhook URL with bot's secret
    const webhookUrl = `https://${projectRef}.supabase.co/functions/v1/generic-bot?secret=${secretString}`;
    console.log(`[SET-WEBHOOK] Constructed webhook URL: ${webhookUrl}`);

    console.log('[SET-WEBHOOK] Calling Telegram API to set webhook...');
    
    // Set webhook
    const result = await setWebhook(botConfig.tg_token, webhookUrl);
    
    console.log(`[SET-WEBHOOK] Telegram API response:`, {
      success: result.success,
      description: result.response?.description || 'No description',
      error_code: result.response?.error_code || 'No error code'
    });

    if (result.success) {
      console.log(`[SET-WEBHOOK] ✅ Webhook successfully set for bot: ${botConfig.name}`);
    } else {
      console.log(`[SET-WEBHOOK] ❌ Failed to set webhook for bot: ${botConfig.name}`);
      console.log(`[SET-WEBHOOK] Telegram error:`, result.response);
    }

    return createCorsJsonResponse({
      success: result.success,
      webhook_url: webhookUrl,
      bot_name: botConfig.name,
      telegram_response: result.response
    }, result.success ? 200 : 400);

  } catch (error) {
    console.error('[SET-WEBHOOK] EXCEPTION:', error);
    console.error('[SET-WEBHOOK] Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    
    return createCorsJsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
}

