import { serve } from "https://deno.land/std/http/server.ts";
import { createAmazonBedrock } from 'https://esm.sh/@ai-sdk/amazon-bedrock';
import { streamText, smoothStream, tool } from 'https://esm.sh/ai@4.2.6';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { TavilyClient } from "https://esm.sh/@agentic/tavily";
import { createAISDKTools } from 'https://esm.sh/@agentic/ai-sdk';
import { z } from 'https://esm.sh/zod';
import { Langfuse } from "https://esm.sh/langfuse";
import { SYSTEM_PROMPT, SPEC_GENERATION_PROMPT, BRD_GENERATION_PROMPT, WELCOME_MESSAGE } from './prompts.ts';
import { 
  TelegramAdapter, 
  ProductionTelegramAdapter, 
  TestTelegramAdapter 
} from './telegram-adapter.ts';
import {
  DatastoreAdapter,
  SupabaseDatastoreAdapter,
  InMemoryDatastoreAdapter
} from './datastore-adapter.ts';

// Initialize Langfuse
export function createLangfuseClient() {
  const langfuse = new Langfuse({
    secretKey: "sk-lf-916764a2-6e05-4ea8-81e5-305efc136645",
    publicKey: "pk-lf-5a9fc3b5-13dd-4465-b3f7-0aa47ebbff8c",
    baseUrl: "https://us.cloud.langfuse.com"
  });
  return langfuse;
}

// Create a Supabase client using the service role
export function createSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  console.log(`[createSupabaseClient] Creating Supabase client with URL: ${supabaseUrl.substring(0, 10)}...`);
  return createClient(supabaseUrl, supabaseKey);
}

// Initialize Claude model
export function getModel() {
  console.log(`[getModel] Initializing Claude model with AWS Bedrock in region: ${Deno.env.get('AWS_REGION')}`);
  const bedrock = createAmazonBedrock({
    region: Deno.env.get('AWS_REGION'),
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')
  });
  const modelId = "us.anthropic.claude-3-7-sonnet-20250219-v1:0";
  console.log(`[getModel] Using model ID: ${modelId}`);
  const model = bedrock(modelId);
  return model;
}

// Function to handle text messages
export async function handleTextMessage(
  message: any, 
  telegram: TelegramAdapter,
  datastore: DatastoreAdapter
) {
  const langfuse = createLangfuseClient();
  const trace = langfuse.trace({
    name: "brdist-conversation",
    userId: message.from.id.toString(),
    metadata: {
      chatId: message.chat.id,
      username: message.from.username,
      firstName: message.from.first_name
    }
  });

  try {
    const userMessage = message.text || "";
    const userId = message.from.id;
    const chatId = message.chat.id;
    
    trace.update({
      input: userMessage
    });
    
    // Show typing indicator
    telegram.sendChatAction({ chat_id: chatId, action: "typing" });
    
    // Get or create BRD session
    let session = await datastore.getBRDSession(userId, chatId);
    if (!session) {
      session = await datastore.createBRDSession({
        user_id: userId,
        chat_id: chatId,
        status: 'active',
        brd_data: {}
      });
      
      if (!session) {
        await telegram.sendMessage({
          chat_id: chatId,
          text: "Sorry, I couldn't create a BRD session. Please try again.",
          parse_mode: "HTML"
        });
        return;
      }
    }
    
    // Store the user's response in BRD data
    const brdData = session.brd_data || {};
    let isComplete = false;
    
    // Initialize Tavily client
    const tavily = new TavilyClient({
      apiKey: Deno.env.get("TAVILY_API_KEY")
    });
    
    // Set up synchronous tools for Claude
    const tools = {
      ...createAISDKTools(tavily),
      brd_update: tool({
        description: 'Update BRD data with key-value pairs',
        parameters: z.object({
          key: z.string().describe('The data key to update'),
          value: z.string().describe('The value to store')
        }),
        execute: async ({ key, value }) => {
          brdData[key] = value;
          return `Updated ${key}: ${value}`;
        }
      }),
      brd_complete: tool({
        description: 'Mark BRD data collection as complete',
        parameters: z.object({}),
        execute: async () => {
          isComplete = true;
          return 'BRD data collection marked as complete';
        }
      }),
      choices: tool({
        description: 'Present multiple choice options to the user',
        parameters: z.object({
          question: z.string().describe('The question to ask'),
          options: z.array(z.string()).describe('Array of choice options')
        }),
        execute: async ({ question, options }) => {
          const replyMarkup = {
            keyboard: options.map(option => [{ text: option }]),
            resize_keyboard: true,
            one_time_keyboard: true
          };
          
          await telegram.sendMessage({
            chat_id: chatId,
            text: `<b>${question}</b>`,
            parse_mode: "HTML",
            reply_markup: replyMarkup
          });
          
          return `Presented choices: ${options.join(', ')}`;
        }
      })
    };
    
    // Store the user message
    await datastore.createMessage({
      user_id: userId,
      chat_id: chatId,
      role: 'user',
      message_text: userMessage
    });
    
    // Get full conversation history for this session
    const conversationHistory = await datastore.getMessages(userId, chatId);
    
    // Build messages array from conversation history
    const messages = [
      {
        role: "system" as const,
        content: SYSTEM_PROMPT
      },
      ...conversationHistory.map(msg => ({
        role: msg.role as "user" | "assistant",
        content: msg.message_text
      }))
    ];
    
    // Create a generation span for LLM call
    const generation = trace.generation({
      name: "claude-brd-conversation",
      model: "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
      input: messages
    });

    // Use Claude to handle the BRD conversation dynamically
    const result = await streamText({
      model: getModel(),
      messages,
      tools,
      maxSteps: 5,
      experimental_transform: smoothStream({
        delayInMs: 200,
        chunking: 'line'
      }),
      onError: ({ error })=>{
        console.error(`Error in streaming response: ${error}`);
        generation.end({
          completionStartTime: new Date(),
          output: `Error: ${error.message}`
        });
      }
    });
    
    // Process the streaming response
    let responseBuffer = "";
    
    for await (const textPart of result.textStream){
      responseBuffer += textPart;
    }
    
    // End the generation span with the output
    generation.end({
      output: responseBuffer
    });
    
    // Send any regular text response
    if (responseBuffer.trim().length > 0) {
      await telegram.sendMessage({
        chat_id: chatId,
        text: responseBuffer,
        parse_mode: "HTML"
      });
    }
    
    // Update BRD session with current data (tools will have updated brdData)
    if (session.id) {
      await datastore.updateBRDSession(session.id, {
        brd_data: brdData
      });
    }
    
    // Mark as complete if indicated
    if (isComplete && session.id) {
      await datastore.updateBRDSession(session.id, { status: 'completed' });
      await telegram.sendMessage({
        chat_id: chatId,
        text: "🎉 Great! I have collected comprehensive information about your project.\n\nYou can now:\n• Use /spec to generate a detailed project specification (spec.md)\n• Use /generate to create a formal Business Requirements Document\n• Continue our conversation to add more details",
        parse_mode: "HTML"
      });
    }
    
    // Store assistant response if any
    if (responseBuffer.trim().length > 0) {
      await datastore.createMessage({
        user_id: userId,
        chat_id: chatId,
        role: 'assistant',
        message_text: responseBuffer
      });
    }

    // End the trace successfully
    trace.update({
      output: responseBuffer,
      metadata: {
        brdDataKeys: Object.keys(brdData),
        sessionComplete: isComplete
      }
    });

  } catch (error) {
    console.error(`Error generating response: ${error}`);
    console.error(`Error stack: ${(error as Error).stack}`);
    
    // Log error to Langfuse
    trace.update({
      output: `Error: ${error.message}`,
      level: "ERROR"
    });

    await telegram.sendMessage({
      chat_id: message.chat.id,
      text: "Sorry, an error occurred while processing your message. Please try again.",
      parse_mode: "HTML"
    });
  } finally {
    // Ensure trace is flushed
    await langfuse.flushAsync();
  }
}

// Handle /start command
export async function handleStartCommand(
  message: any, 
  telegram: TelegramAdapter,
  datastore: DatastoreAdapter
) {
  console.log(`Processing /start command from user ${message.from.id} in chat ${message.chat.id}`);
  console.log(`User info: ${message.from.first_name} ${message.from.last_name || ''} ${message.from.username ? `(@${message.from.username})` : ''}`);
  
  // Clean up any old messages and sessions
  await datastore.deleteMessages(message.from.id, message.chat.id);
  await datastore.deleteBRDSessions(message.from.id, message.chat.id);
  
  // Create new BRD session
  await datastore.createBRDSession({
    user_id: message.from.id,
    chat_id: message.chat.id,
    status: 'active',
    brd_data: {}
  });
  
  
  const messageSent = await telegram.sendMessage({
    chat_id: message.chat.id,
    text: WELCOME_MESSAGE,
    parse_mode: "HTML"
  });
  console.log(`Welcome message sent: ${messageSent ? 'success' : 'failed'}`);
}

// Handle /clear command to start a new session
export async function handleClearCommand(
  message: any,
  telegram: TelegramAdapter,
  datastore: DatastoreAdapter
) {
  const userId = message.from.id;
  const chatId = message.chat.id;
  const langfuse = createLangfuseClient();
  
  console.log(`Processing /clear command from user ${userId} in chat ${chatId}`);
  
  // Create a new Langfuse session
  const session = langfuse.trace({
    name: "brdist-new-session",
    userId: userId.toString(),
    sessionId: `session-${Date.now()}`,
    metadata: {
      chatId: chatId,
      command: "clear",
      username: message.from.username,
      firstName: message.from.first_name
    }
  });
  
  try {
    // Clean up any old messages and sessions
    await datastore.deleteMessages(userId, chatId);
    await datastore.deleteBRDSessions(userId, chatId);
    
    // Create new BRD session
    await datastore.createBRDSession({
      user_id: userId,
      chat_id: chatId,
      status: 'active',
      brd_data: {}
    });
    
    const messageSent = await telegram.sendMessage({
      chat_id: chatId,
      text: `🆕 <b>New session started!</b>\n\n${WELCOME_MESSAGE}`,
      parse_mode: "HTML"
    });
    
    session.update({
      output: "New session created successfully"
    });
    
    console.log(`New session created: ${messageSent ? 'success' : 'failed'}`);
  } catch (error) {
    console.error(`Error creating new session: ${error}`);
    session.update({
      output: `Error: ${error.message}`,
      level: "ERROR"
    });
    
    await telegram.sendMessage({
      chat_id: chatId,
      text: "❌ Sorry, I couldn't create a new session. Please try again.",
      parse_mode: "HTML"
    });
  } finally {
    await langfuse.flushAsync();
  }
}

// Handle /brds command to list and switch sessions
export async function handleBrdsCommand(
  message: any,
  telegram: TelegramAdapter,
  datastore: DatastoreAdapter
) {
  const userId = message.from.id;
  const chatId = message.chat.id;
  
  console.log(`Processing /brds command from user ${userId} in chat ${chatId}`);
  
  try {
    // Get all sessions for this user
    const sessions = await datastore.getAllBRDSessions(userId, chatId);
    
    if (!sessions || sessions.length === 0) {
      await telegram.sendMessage({
        chat_id: chatId,
        text: "📝 You don't have any BRD sessions yet. Use /start to begin a new one!",
        parse_mode: "HTML"
      });
      return;
    }
    
    // Format sessions list
    let sessionsList = "📋 <b>Your BRD Sessions:</b>\n\n";
    sessions.forEach((session, index) => {
      const createdAt = new Date(session.created_at).toLocaleDateString();
      const dataCount = Object.keys(session.brd_data || {}).length;
      const status = session.status === 'active' ? '🟢' : session.status === 'completed' ? '✅' : '📤';
      
      sessionsList += `${status} <b>Session ${index + 1}</b> (${createdAt})\n`;
      sessionsList += `   Status: ${session.status}\n`;
      sessionsList += `   Data points: ${dataCount}\n`;
      if (dataCount > 0) {
        const firstKey = Object.keys(session.brd_data)[0];
        const preview = session.brd_data[firstKey]?.toString().substring(0, 50) || '';
        sessionsList += `   Preview: ${preview}${preview.length >= 50 ? '...' : ''}\n`;
      }
      sessionsList += `   ID: <code>${session.id}</code>\n\n`;
    });
    
    sessionsList += "💡 <i>To switch to a session, reply with its ID</i>";
    
    await telegram.sendMessage({
      chat_id: chatId,
      text: sessionsList,
      parse_mode: "HTML"
    });
    
  } catch (error) {
    console.error(`Error listing sessions: ${error}`);
    await telegram.sendMessage({
      chat_id: chatId,
      text: "❌ Sorry, I couldn't retrieve your sessions. Please try again.",
      parse_mode: "HTML"
    });
  }
}

// Handle /spec command to generate project specification
export async function handleSpecCommand(
  message: any,
  telegram: TelegramAdapter,
  datastore: DatastoreAdapter  
) {
  const userId = message.from.id;
  const chatId = message.chat.id;
  
  // Get the current session
  const session = await datastore.getLatestBRDSession(userId, chatId);
  
  if (!session || !session.brd_data || Object.keys(session.brd_data).length < 5) {
    await telegram.sendMessage({
      chat_id: chatId,
      text: "⚠️ I need more information before generating the specification. Please continue our conversation, or type /start to begin a new session.",
      parse_mode: "HTML"
    });
    return;
  }
  
  telegram.sendChatAction({ chat_id: chatId, action: "typing" });
  
  // Get conversation history for the session
  const conversationHistory = await datastore.getMessages(userId, chatId);
  
  // Build messages array from conversation history
  const messages = [
    {
      role: "system" as const,
      content: SPEC_GENERATION_PROMPT
    },
    ...conversationHistory.map(msg => ({
      role: msg.role as "user" | "assistant",
      content: msg.message_text
    })),
    {
      role: "user" as const,
      content: "Generate the complete project specification document."
    }
  ];

  // Generate spec using Claude
  const result = await streamText({
    model: getModel(),
    messages,
    maxSteps: 15
  });
  
  let specContent = "";
  for await (const chunk of result.textStream) {
    specContent += chunk;
  }
  
  // Extract title from the spec (usually first # heading)
  const titleMatch = specContent.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : "Project Specification";
  
  // Save the spec to database
  const spec = await datastore.createSpec({
    user_id: userId,
    chat_id: chatId,
    session_id: session.id,
    title: title,
    content: specContent,
    spec_type: 'project',
    metadata: {
      brd_data_keys: Object.keys(brdData),
      generated_from: 'brd_session'
    }
  });
  
  if (!spec) {
    await telegram.sendMessage({
      chat_id: chatId,
      text: "❌ Sorry, I couldn't save the specification. Please try again.",
      parse_mode: "HTML"
    });
    return;
  }
  
  // Send spec in chunks if it's too long
  const maxLength = 4000;
  if (specContent.length > maxLength) {
    // Send first chunk with title
    await telegram.sendMessage({
      chat_id: chatId,
      text: `📋 <b>${title}</b>\n\n${specContent.substring(0, maxLength - 100)}...`,
      parse_mode: "HTML"
    });
    
    // Send remaining chunks
    for (let i = maxLength - 100; i < specContent.length; i += maxLength) {
      await telegram.sendMessage({
        chat_id: chatId,
        text: specContent.substring(i, i + maxLength),
        parse_mode: "HTML"
      });
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } else {
    await telegram.sendMessage({
      chat_id: chatId,
      text: `📋 <b>${title}</b>\n\n${specContent}`,
      parse_mode: "HTML"
    });
  }
  
  // Send completion message
  const completionMsg = `\n✅ <b>Project Specification Generated!</b>\n\nYour spec.md has been created and saved. You can now:\n• Use this spec to guide development\n• Share it with your development team\n• Type /generate for a formal BRD\n• Type /start to create another project`;
  
  await telegram.sendMessage({
    chat_id: chatId,
    text: completionMsg,
    parse_mode: "HTML"
  });
}

// Handle /generate command to create the final BRD
export async function handleGenerateCommand(
  message: any, 
  telegram: TelegramAdapter,
  datastore: DatastoreAdapter
) {
  const userId = message.from.id;
  const chatId = message.chat.id;
  
  // Get the current session
  const session = await datastore.getLatestBRDSession(userId, chatId);
    
  if (!session || !session.brd_data || Object.keys(session.brd_data).length < 5) {
    await telegram.sendMessage({
      chat_id: chatId,
      text: "⚠️ I need more information before generating the BRD. Please continue our conversation, or type /start to begin a new session.",
      parse_mode: "HTML"
    });
    return;
  }
  
  telegram.sendChatAction({ chat_id: chatId, action: "typing" });
  
  // Get conversation history for the session
  const conversationHistory = await datastore.getMessages(userId, chatId);
  
  // Build messages array from conversation history
  const messages = [
    {
      role: "system" as const,
      content: BRD_GENERATION_PROMPT
    },
    ...conversationHistory.map(msg => ({
      role: msg.role as "user" | "assistant",
      content: msg.message_text
    })),
    {
      role: "user" as const,
      content: "Generate the complete BRD document."
    }
  ];

  // Generate BRD using Claude
  const result = await streamText({
    model: getModel(),
    messages,
    maxSteps: 10
  });
  
  let brdContent = "";
  for await (const chunk of result.textStream) {
    brdContent += chunk;
  }
  
  // Send BRD in chunks if it's too long
  const maxLength = 4000;
  if (brdContent.length > maxLength) {
    const chunks = [];
    for (let i = 0; i < brdContent.length; i += maxLength) {
      chunks.push(brdContent.slice(i, i + maxLength));
    }
    
    for (const chunk of chunks) {
      await telegram.sendMessage({
        chat_id: chatId,
        text: chunk,
        parse_mode: "HTML"
      });
      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between chunks
    }
  } else {
    await telegram.sendMessage({
      chat_id: chatId,
      text: brdContent,
      parse_mode: "HTML"
    });
  }
  
  // Mark session as exported
  if (session.id) {
    await datastore.updateBRDSession(session.id, { status: 'exported' });
  }
  
  // Send completion message
  const completionMsg = `

✅ <b>BRD Generated Successfully!</b>

Your Business Requirements Document is ready. You can now:
• Share this with stakeholders
• Use it for project planning
• Type /start to create another BRD`;
  
  await telegram.sendMessage({
    chat_id: chatId,
    text: completionMsg,
    parse_mode: "HTML"
  });
}

// Process webhook message with adapter
export async function processWebhookMessage(
  message: any, 
  telegram: TelegramAdapter,
  datastore: DatastoreAdapter
) {
  // Handle commands
  if (message.text && message.text.startsWith("/")) {
    if (message.text.startsWith("/start")) {
      await handleStartCommand(message, telegram, datastore);
    } else if (message.text.startsWith("/clear")) {
      await handleClearCommand(message, telegram, datastore);
    } else if (message.text.startsWith("/brds")) {
      await handleBrdsCommand(message, telegram, datastore);
    } else if (message.text.startsWith("/generate")) {
      await handleGenerateCommand(message, telegram, datastore);
    } else if (message.text.startsWith("/spec")) {
      await handleSpecCommand(message, telegram, datastore);
    } else {
      await telegram.sendMessage({
        chat_id: message.chat.id,
        text: "Unknown command. Available commands:\n• /start - Begin a new project\n• /clear - Start fresh session\n• /brds - View your sessions\n• /spec - Generate project specification\n• /generate - Create formal BRD",
        parse_mode: "HTML"
      });
    }
  } else if (message.text) {
    // Process the message asynchronously to avoid webhook timeout
    const promise = handleTextMessage(message, telegram, datastore);
    // Use promise.catch to handle errors without blocking
    promise.catch((err)=>console.error(`Error in async message handling: ${err}`));
  }
}

// Function to set Telegram webhook
async function setTelegramWebhook(): Promise<Response> {
  try {
    const botToken = Deno.env.get("BRDIST_BOT_API_TOKEN");
    const functionSecret = Deno.env.get("FUNCTION_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    
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
        error: "Could not extract project reference from SUPABASE_URL"
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // Construct webhook URL
    const webhookUrl = `https://${projectRef}.supabase.co/functions/v1/brdist?secret=${functionSecret}`;
    
    // Set webhook via Telegram API
    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/setWebhook`;
    const response = await fetch(telegramApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message"],
        drop_pending_updates: true
      })
    });
    
    const result = await response.json();
    
    if (result.ok) {
      return new Response(JSON.stringify({
        success: true,
        message: "Webhook set successfully",
        webhook_url: webhookUrl,
        telegram_response: result
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } else {
      return new Response(JSON.stringify({
        success: false,
        error: "Failed to set webhook",
        telegram_response: result
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
  } catch (error) {
    console.error(`Error setting webhook: ${error}`);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

// Main handler function
if (import.meta.main) {
  serve(async (req)=>{
    try {
      const url = new URL(req.url);
      const pathname = url.pathname;
      
      // Handle set-webhook endpoint
      if (pathname.endsWith('/set-webhook') && (req.method === 'POST' || req.method === 'GET')) {
        // Verify the secret for set-webhook endpoint
        const secret = url.searchParams.get("secret");
        const expectedSecret = Deno.env.get("FUNCTION_SECRET");
        if (secret !== expectedSecret) {
          return new Response("Unauthorized", { status: 401 });
        }
        return await setTelegramWebhook();
      }
      
      // Handle webhook endpoint (default)
      if (req.method === 'POST' && pathname.endsWith('/brdist')) {
        // Verify the secret
        const secret = url.searchParams.get("secret");
        const expectedSecret = Deno.env.get("FUNCTION_SECRET");
        if (secret !== expectedSecret) {
          console.error(`Unauthorized request: Invalid secret`);
          return new Response("Unauthorized", {
            status: 401
          });
        }
        
        // Parse the webhook data
        const update = await req.json();
        // Handle the message
        const message = update.message;
        if (!message) {
          return new Response("No message in update", {
            status: 200
          });
        }
        
        // Create production adapters
        const telegram = new ProductionTelegramAdapter(Deno.env.get("BRDIST_BOT_API_TOKEN") || "");
        const supabase = createSupabaseClient();
        const datastore = new SupabaseDatastoreAdapter(supabase);
        
        await processWebhookMessage(message, telegram, datastore);
        
        // Always return 200 OK quickly to acknowledge receipt
        return new Response("OK", {
          status: 200
        });
      }
      
      // Handle unsupported methods
      return new Response("Method not allowed", { status: 405 });
      
    } catch (error) {
      console.error(`Error processing request: ${error}`);
      return new Response("Error processing request", {
        status: 500
      });
    }
  });
}