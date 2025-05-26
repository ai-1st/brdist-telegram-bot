import { serve } from "https://deno.land/std/http/server.ts";
import { createAmazonBedrock } from 'https://esm.sh/@ai-sdk/amazon-bedrock';
import { TelegramBot, TelegramMessage, ChatMessage } from '../lib/telegram-bot-framework.ts';

// Simple in-memory chat history storage
const chatHistory = new Map<string, ChatMessage[]>();

// Example implementation of a generic chat bot
class GenericChatBot extends TelegramBot {
  
  // Override system instructions for a generic assistant
  getSystemInstructions(): string {
    return `You are a friendly and helpful AI assistant. You can search the web for current information and provide visual aids when appropriate.

You must use special commands in your response:
1. To send an image: TG_IMAGE image_url; image_caption
2. To send a conclusion with suggestions: TG_CONCLUSION conclusion_text; suggestion1; suggestion2; suggestion3

Example response format:
"Let me help you with that! Here's what I found about space exploration.

The International Space Station orbits Earth at approximately 400km altitude.
TG_IMAGE https://example.com/iss.jpg; The International Space Station in orbit

It travels at about 27,600 km/h, completing one orbit every 90 minutes.

TG_CONCLUSION Would you like to know more?; Tell me about astronauts; Show me rocket launches; Explain space missions"

Use HTML formatting: <b>bold</b>, <i>italic</i>, <u>underlined</u>

IMPORTANT: 
- Search the web when users ask about current events or need up-to-date information
- Include relevant images when they would enhance understanding
- Always end with TG_CONCLUSION to suggest follow-up topics
- Keep responses concise and engaging`;
  }

  // Override chat history management with in-memory storage
  async loadChatHistory(userId: number, chatId: number): Promise<ChatMessage[]> {
    const key = `${userId}-${chatId}`;
    return chatHistory.get(key) || [];
  }

  async addChatHistory(userId: number, chatId: number, message: ChatMessage): Promise<void> {
    const key = `${userId}-${chatId}`;
    const history = chatHistory.get(key) || [];
    history.push(message);
    
    // Keep only last 20 messages to prevent memory issues
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }
    
    chatHistory.set(key, history);
  }

  // Override start command with custom welcome
  async handleStartCommand(message: TelegramMessage): Promise<void> {
    const userName = message.from.first_name || "there";
    const welcomeMessage = `👋 <b>Hello ${userName}!</b>

I'm your AI assistant powered by Claude. I can help you with:

🔍 <b>Research</b> - Search the web for current information
💡 <b>Ideas</b> - Brainstorm and explore concepts  
📚 <b>Learning</b> - Explain complex topics simply
🖼️ <b>Visuals</b> - Find relevant images and diagrams
💬 <b>Conversation</b> - Chat about anything you're curious about

Just send me a message to get started! I'll search for information, provide images when helpful, and suggest related topics you might find interesting.

<i>Tip: I work best when you ask specific questions!</i>`;

    await this.sendTelegramMessage(message.chat.id, welcomeMessage);
    
    // Clear chat history on /start
    const key = `${message.from.id}-${message.chat.id}`;
    chatHistory.delete(key);
  }

  // Add custom commands
  async handleCommand(command: string, message: TelegramMessage): Promise<boolean> {
    switch (command) {
      case "/help":
        await this.sendTelegramMessage(
          message.chat.id,
          `<b>Available Commands:</b>\n\n` +
          `/start - Start fresh conversation\n` +
          `/help - Show this help message\n` +
          `/clear - Clear conversation history\n\n` +
          `Just send me any message to chat!`
        );
        return true;
        
      case "/clear":
        const key = `${message.from.id}-${message.chat.id}`;
        chatHistory.delete(key);
        await this.sendTelegramMessage(
          message.chat.id,
          "✨ Conversation history cleared! Let's start fresh."
        );
        return true;
        
      default:
        return false;
    }
  }

  // Override image processing with Claude vision
  async processImage(imageUrl: string, caption?: string): Promise<string> {
    // In a real implementation, you would use Claude's vision capabilities
    // For now, return a structured description
    return [
      {
        type: "text",
        text: caption || "Please analyze this image and describe what you see."
      },
      {
        type: "image",
        image: new URL(imageUrl)
      }
    ];
  }
}

// Initialize the bot
function createBot() {
  const bedrock = createAmazonBedrock({
    region: Deno.env.get('AWS_REGION'),
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')
  });
  
  const model = bedrock("us.anthropic.claude-3-7-sonnet-20250219-v1:0");
  
  return new GenericChatBot({
    botToken: Deno.env.get('TELEGRAM_BOT_TOKEN') || '',
    model: model,
    tavilyApiKey: Deno.env.get('TAVILY_API_KEY'),
    streamingDelayMs: 200
  });
}

// Webhook handler
async function handleWebhook(req: Request): Promise<Response> {
  try {
    const update = await req.json();
    const bot = createBot();
    await bot.handleWebhook(update);
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error(`Error handling webhook: ${error}`);
    return new Response("Error", { status: 500 });
  }
}

// Set webhook endpoint
async function setWebhook(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const functionSecret = Deno.env.get('FUNCTION_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    
    if (!botToken || !functionSecret || !supabaseUrl) {
      return new Response(JSON.stringify({
        success: false,
        error: "Missing required environment variables"
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Extract project ref from Supabase URL
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
    if (!projectRef) {
      return new Response(JSON.stringify({
        success: false,
        error: "Could not extract project reference"
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    const webhookUrl = `https://${projectRef}.supabase.co/functions/v1/generic-bot?secret=${functionSecret}`;
    
    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/setWebhook`;
    const response = await fetch(telegramApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message"],
        drop_pending_updates: true
      })
    });
    
    const result = await response.json();
    
    return new Response(JSON.stringify({
      success: result.ok,
      webhook_url: webhookUrl,
      telegram_response: result
    }), {
      status: result.ok ? 200 : 400,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// Main handler
if (import.meta.main) {
  serve(async (req) => {
    const url = new URL(req.url);
    const pathname = url.pathname;
    
    // Verify secret for all endpoints
    const secret = url.searchParams.get("secret");
    const expectedSecret = Deno.env.get("FUNCTION_SECRET");
    
    if (secret !== expectedSecret) {
      return new Response("Unauthorized", { status: 401 });
    }
    
    // Handle set-webhook endpoint
    if (pathname.endsWith('/set-webhook')) {
      return await setWebhook(req);
    }
    
    // Handle webhook
    if (req.method === 'POST') {
      return await handleWebhook(req);
    }
    
    return new Response("Method not allowed", { status: 405 });
  });
}