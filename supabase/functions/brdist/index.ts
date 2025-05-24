import { serve } from "https://deno.land/std/http/server.ts";
import { createAmazonBedrock } from 'https://esm.sh/@ai-sdk/amazon-bedrock';
import { streamText, smoothStream, tool } from 'https://esm.sh/ai@4.2.6';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { TavilyClient } from "https://esm.sh/@agentic/tavily";
import { createAISDKTools } from 'https://esm.sh/@agentic/ai-sdk';
import { z } from 'https://esm.sh/zod';
import { Langfuse } from "https://esm.sh/langfuse";
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
    
    // Store the conversation in messages table for context
    await datastore.createMessage({
      user_id: userId,
      chat_id: chatId,
      role: 'user',
      message_text: userMessage
    });
    
    // Create a generation span for LLM call
    const generation = trace.generation({
      name: "claude-brd-conversation",
      model: "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
      input: [
        {
          role: "system",
          content: `You are BRDist, a Business Requirements Document assistant. You help users create comprehensive BRDs through intelligent conversation.

Current BRD data collected so far:
${JSON.stringify(brdData, null, 2)}

Your task:
1. If this is the user's first message (brdData is empty), acknowledge their business idea and ask about the project type
2. Store key information from their response
3. Ask the next most relevant question based on what's been collected
4. When asking questions that have common options, use the CHOICES command to provide keyboard options

Important guidelines:
- Keep responses concise and professional
- Ask one question at a time
- Cover these areas throughout the conversation:
  * Project type and description
  * Target audience
  * Project scale and timeline
  * Budget considerations
  * Key features and requirements
  * Technical specifications
  * Integration needs
  * Compliance requirements
  * Success metrics
  * Any additional information
- After collecting sufficient information (10-12 key data points), inform the user they can use /generate to create the BRD

Available tools:
- brd_update: Use this tool to store collected information with key-value pairs
- brd_complete: Use this tool when enough information has been collected
- choices: Use this tool to present multiple choice questions with keyboard options
- tavily_web_search: Use for web research when needed

Format all responses with HTML: <b>bold</b>, <i>italic</i>, etc.

IMPORTANT: Focus on gathering detailed technical and implementation details that would be needed for a comprehensive project specification. Ask about:
- Specific technical requirements and constraints
- Detailed feature descriptions and user workflows
- Performance and scalability needs
- Security and compliance requirements
- Integration points and APIs
- Development methodology preferences`
        },
        {
          role: "user",
          content: userMessage
        }
      ]
    });

    // Use Claude to handle the BRD conversation dynamically
    const result = await streamText({
      model: getModel(),
      messages: [
        {
          role: "system",
          content: `You are BRDist, a Business Requirements Document assistant. You help users create comprehensive BRDs through intelligent conversation.

Current BRD data collected so far:
${JSON.stringify(brdData, null, 2)}

Your task:
1. If this is the user's first message (brdData is empty), acknowledge their business idea and ask about the project type
2. Store key information from their response
3. Ask the next most relevant question based on what's been collected
4. When asking questions that have common options, use the CHOICES command to provide keyboard options

Important guidelines:
- Keep responses concise and professional
- Ask one question at a time
- Cover these areas throughout the conversation:
  * Project type and description
  * Target audience
  * Project scale and timeline
  * Budget considerations
  * Key features and requirements
  * Technical specifications
  * Integration needs
  * Compliance requirements
  * Success metrics
  * Any additional information
- After collecting sufficient information (10-12 key data points), inform the user they can use /generate to create the BRD

Available tools:
- brd_update: Use this tool to store collected information with key-value pairs
- brd_complete: Use this tool when enough information has been collected
- choices: Use this tool to present multiple choice questions with keyboard options
- tavily_web_search: Use for web research when needed

Format all responses with HTML: <b>bold</b>, <i>italic</i>, etc.

IMPORTANT: Focus on gathering detailed technical and implementation details that would be needed for a comprehensive project specification. Ask about:
- Specific technical requirements and constraints
- Detailed feature descriptions and user workflows
- Performance and scalability needs
- Security and compliance requirements
- Integration points and APIs
- Development methodology preferences`
        },
        {
          role: "user",
          content: userMessage
        }
      ],
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
  
  // Format with HTML
  const welcomeMessage = `💼 <b>Welcome to BRDist - Project Specification & BRD Assistant!</b>

I'll help you create comprehensive project documentation through our conversation.

🎯 <b>Here's how it works:</b>
• Tell me about your business idea or project
• I'll ask detailed questions to understand your needs
• Answer my questions (I'll provide options when helpful)
• Once we've gathered enough information:
  - Use /spec to generate a technical project specification
  - Use /generate to create a formal BRD

<b>Let's start! Please describe your business idea or project in detail.</b>`;
  
  const messageSent = await telegram.sendMessage({
    chat_id: message.chat.id,
    text: welcomeMessage,
    parse_mode: "HTML"
  });
  console.log(`Welcome message sent: ${messageSent ? 'success' : 'failed'}`);
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
  
  // Generate spec using Claude
  const brdData = session.brd_data;
  const result = await streamText({
    model: getModel(),
    messages: [
      {
        role: "system",
        content: `You are creating a detailed project specification (spec.md) based on the collected requirements.

Collected information:
${JSON.stringify(brdData, null, 2)}

Create a comprehensive specification document that includes:

1. **Project Overview**
   - Clear project name and description
   - Problem statement
   - Solution approach
   - Key value propositions

2. **Technical Architecture**
   - System architecture overview
   - Technology stack recommendations with justifications
   - Database design considerations
   - API design principles
   - Security architecture

3. **Functional Requirements**
   - Detailed user stories
   - Core features with acceptance criteria
   - User workflows
   - Edge cases and error handling

4. **Non-Functional Requirements**
   - Performance targets
   - Scalability requirements
   - Security requirements
   - Accessibility standards
   - Browser/device compatibility

5. **Implementation Plan**
   - Development phases
   - MVP definition
   - Feature prioritization
   - Technical milestones

6. **Data Model**
   - Entity relationships
   - Key data structures
   - Data flow diagrams

7. **Integration Requirements**
   - External service integrations
   - API specifications
   - Authentication/authorization flow

8. **Testing Strategy**
   - Unit testing approach
   - Integration testing
   - User acceptance testing criteria

9. **Deployment Strategy**
   - Infrastructure requirements
   - CI/CD pipeline
   - Monitoring and logging

10. **Success Metrics**
    - KPIs and how to measure them
    - Performance benchmarks
    - User satisfaction metrics

Format as a proper Markdown document with clear sections, code examples where relevant, and actionable details.
Focus on being specific and implementation-ready rather than generic.
This should be a document that a development team can use to start building immediately.`
      },
      {
        role: "user",
        content: "Generate the complete project specification document."
      }
    ],
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
  
  // Generate BRD using Claude
  const brdData = session.brd_data;
  const result = await streamText({
    model: getModel(),
    messages: [
      {
        role: "system",
        content: `Create a professional Business Requirements Document based on this collected information:
${JSON.stringify(brdData, null, 2)}

Format the BRD with these sections using HTML:
1. <b>Executive Summary</b> - High-level overview of the project
2. <b>Project Overview</b> - Detailed description of what's being built
3. <b>Business Objectives</b> - Key goals and expected outcomes
4. <b>Scope & Deliverables</b> - What's included and what's not
5. <b>Functional Requirements</b> - Core features and capabilities
6. <b>Non-Functional Requirements</b> - Performance, security, usability needs
7. <b>Technical Architecture</b> - Technology stack and infrastructure
8. <b>Timeline & Milestones</b> - Project phases and key dates
9. <b>Budget Considerations</b> - Cost estimates and resource needs
10. <b>Success Metrics</b> - KPIs and measurement criteria
11. <b>Risks & Mitigation</b> - Potential challenges and solutions
12. <b>Next Steps</b> - Immediate actions to move forward

Use HTML formatting throughout. Be comprehensive but concise. 
Intelligently expand on the provided information to create a professional document.
If some sections lack specific data, make reasonable professional assumptions and note them.`
      },
      {
        role: "user",
        content: "Generate the complete BRD document."
      }
    ],
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
    } else if (message.text.startsWith("/generate")) {
      await handleGenerateCommand(message, telegram, datastore);
    } else if (message.text.startsWith("/spec")) {
      await handleSpecCommand(message, telegram, datastore);
    } else {
      await telegram.sendMessage({
        chat_id: message.chat.id,
        text: "Unknown command. Available commands:\n• /start - Begin a new project\n• /spec - Generate project specification\n• /generate - Create formal BRD",
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