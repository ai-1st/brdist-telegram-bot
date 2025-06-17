// ABOUTME: Implements Telegram streaming responses for the generic bot
// ABOUTME: Processes LLM output line-by-line and sends to Telegram in real-time

import { streamText, smoothStream } from 'https://esm.sh/ai@4.2.6';
import { createAmazonBedrock } from 'https://esm.sh/@ai-sdk/amazon-bedrock';
import { TavilyClient } from "https://esm.sh/@agentic/tavily";
import { createAISDKTools } from 'https://esm.sh/@agentic/ai-sdk';
import type { ChatMessage, Webtool } from './dal.ts';
import { loadWebtoolsForBot } from '../_shared/webtools.ts';

interface ReplyConfig {
  botApiKey: string;
  chatId: number;
  awsRegion?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  tavilyApiKey?: string;
  systemPrompt: string;
  webtools?: Webtool[];
}

interface TelegramReplyMarkup {
  keyboard?: Array<Array<{ text: string }>>;
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
}

async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  replyMarkup?: TelegramReplyMarkup
): Promise<boolean> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  const body: {
    chat_id: number;
    text: string;
    parse_mode: string;
    reply_markup?: TelegramReplyMarkup;
  } = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML"
  };
  
  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    
    const result = await response.json();
    if (!result.ok) {
      console.error(`Telegram API error:`, result);
    }
    return result.ok;
  } catch (error) {
    console.error(`Error sending message: ${error}`);
    return false;
  }
}

async function sendTelegramPhoto(
  botToken: string,
  chatId: number,
  photoUrl: string,
  caption?: string
): Promise<boolean> {
  const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
  
  const body: {
    chat_id: number;
    photo: string;
    parse_mode: string;
    caption?: string;
  } = {
    chat_id: chatId,
    photo: photoUrl,
    parse_mode: "HTML"
  };
  
  if (caption) {
    body.caption = caption;
  }
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    
    const result = await response.json();
    if (!result.ok) {
      console.error(`Telegram API error:`, result);
    }
    return result.ok;
  } catch (error) {
    console.error(`Error sending photo: ${error}`);
    return false;
  }
}

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

async function processStreamLine(
  line: string,
  botToken: string,
  chatId: number
): Promise<void> {
  if (!line) return;

  // Process TG_IMAGE commands
  if (line.startsWith("TG_IMAGE ") && line.includes(";")) {
    const parts = line.replace("TG_IMAGE ", "").split(";");
    if (parts.length >= 1) {
      const imageUrl = parts[0].trim();
      const caption = parts[1]?.trim() || "";
      
      console.log(`Processing image command: URL=${imageUrl}, Caption=${caption}`);
      const imgSent = await sendTelegramPhoto(botToken, chatId, imageUrl, caption);
      console.log(`Sent image to Telegram: ${imgSent ? 'success' : 'failed'}`);
      
      // Show typing indicator to continue the conversation flow
      sendChatAction(botToken, chatId);
    }
  }
  // Process TG_CONCLUSION commands
  else if (line.startsWith("TG_CONCLUSION ") && line.includes(";")) {
    const parts = line.replace("TG_CONCLUSION ", "").split(";");
    if (parts.length >= 2) {
      const conclusionText = parts[0].trim();
      const suggestions = parts.slice(1).map(s => s.trim()).filter(s => s.length > 0);
      
      console.log(`Processing conclusion command: Text=${conclusionText.substring(0, 50)}..., Suggestions=${JSON.stringify(suggestions)}`);
      
      const replyMarkup: TelegramReplyMarkup = {
        keyboard: suggestions.map(suggestion => [{ text: suggestion }]),
        resize_keyboard: true,
        one_time_keyboard: true
      };
      
      const conclSent = await sendTelegramMessage(botToken, chatId, conclusionText, replyMarkup);
      console.log(`Sent conclusion with ${suggestions.length} suggestions to Telegram: ${conclSent ? 'success' : 'failed'}`);
    }
  }
  // Process regular text
  else if (line.trim().length > 0) {
    console.log(`Sending text chunk: ${line.substring(0, 50)}...`);
    const textSent = await sendTelegramMessage(botToken, chatId, line);
    console.log(`Sent text chunk to Telegram: ${textSent ? 'success' : 'failed'}`);
    
    // Show typing indicator to continue the conversation flow
    await sendChatAction(botToken, chatId);
  }
}

export async function reply(
  config: ReplyConfig,
  history: ChatMessage[]
): Promise<string> {
  console.log('[reply] Starting streaming response generation');
  
  // Initialize Claude model
  const bedrock = createAmazonBedrock({
    region: config.awsRegion || Deno.env.get('AWS_REGION'),
    accessKeyId: config.awsAccessKeyId || Deno.env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: config.awsSecretAccessKey || Deno.env.get('AWS_SECRET_ACCESS_KEY')
  });
  
  const model = bedrock("us.anthropic.claude-3-7-sonnet-20250219-v1:0");
  
  // Initialize tools
  let tools = {};
  
  // Add Tavily search tools if API key is provided
  if (config.tavilyApiKey) {
    const tavily = new TavilyClient({ apiKey: config.tavilyApiKey });
    tools = { ...tools, ...createAISDKTools(tavily) };
  }
  
  // Add webtools if provided
  if (config.webtools && config.webtools.length > 0) {
    console.log(`[reply] Loading ${config.webtools.length} webtools`);
    const webtoolsDict = await loadWebtoolsForBot(config.webtools);
    tools = { ...tools, ...webtoolsDict };
    console.log(`[reply] Total tools available: ${Object.keys(tools).length}`);
  }
  
  // Build messages array with system prompt
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: config.systemPrompt
    },
    ...history
  ];
  
  // Buffer to collect the assistant's response
  let assistantResponseBuffer = "";
  
  try {
    // Generate streaming response
    const result = await streamText({
      model,
      messages,
      tools,
      maxSteps: 10,
      experimental_transform: smoothStream({
        delayInMs: 200,
        chunking: 'line'
      })
    });
    
    // Process the streaming response
    let lineBuffer = "";
    
    for await (const textPart of result.textStream) {
      assistantResponseBuffer += textPart;
      lineBuffer += textPart;
      
      // Process complete lines
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || "";
      
      for (const line of lines) {
        await processStreamLine(line.trim(), config.botApiKey, config.chatId);
      }
    }
    
    // Process any remaining content
    if (lineBuffer.trim()) {
      await processStreamLine(lineBuffer.trim(), config.botApiKey, config.chatId);
    }
    
    console.log('[reply] Streaming response completed successfully');
    return assistantResponseBuffer;
    
  } catch (error) {
    console.error('[reply] Error generating response:', error);
    const errorMessage = "Sorry, I encountered an error processing your request. Please try again.";
    await sendTelegramMessage(config.botApiKey, config.chatId, errorMessage);
    return errorMessage;
  }
}

// Helper function to process image messages
export async function processImageWithLLM(
  imageUrl: string,
  caption: string,
  systemPrompt: string,
  config: ReplyConfig
): Promise<string> {
  console.log('[processImageWithLLM] Starting image processing');
  
  // Initialize Claude model
  const bedrock = createAmazonBedrock({
    region: config.awsRegion || Deno.env.get('AWS_REGION'),
    accessKeyId: config.awsAccessKeyId || Deno.env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: config.awsSecretAccessKey || Deno.env.get('AWS_SECRET_ACCESS_KEY')
  });
  
  const model = bedrock("us.anthropic.claude-3-7-sonnet-20250219-v1:0");
  
  // Initialize tools
  let tools = {};
  
  // Add Tavily search tools if API key is provided
  if (config.tavilyApiKey) {
    const tavily = new TavilyClient({ apiKey: config.tavilyApiKey });
    tools = { ...tools, ...createAISDKTools(tavily) };
  }
  
  // Add webtools if provided
  if (config.webtools && config.webtools.length > 0) {
    console.log(`[processImageWithLLM] Loading ${config.webtools.length} webtools`);
    const webtoolsDict = await loadWebtoolsForBot(config.webtools);
    tools = { ...tools, ...webtoolsDict };
    console.log(`[processImageWithLLM] Total tools available: ${Object.keys(tools).length}`);
  }
  
  let responseBuffer = "";
  
  try {
    const result = await streamText({
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: caption || "Please analyze this image and describe what you see."
            },
            {
              type: "image",
              image: new URL(imageUrl)
            }
          ]
        }
      ],
      tools,
      maxSteps: 5,
      experimental_transform: smoothStream({
        delayInMs: 200,
        chunking: 'line'
      })
    });
    
    // Process streaming response
    let lineBuffer = "";
    
    for await (const textPart of result.textStream) {
      responseBuffer += textPart;
      lineBuffer += textPart;
      
      // Process complete lines
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || "";
      
      for (const line of lines) {
        await processStreamLine(line.trim(), config.botApiKey, config.chatId);
      }
    }
    
    // Process any remaining content
    if (lineBuffer.trim()) {
      await processStreamLine(lineBuffer.trim(), config.botApiKey, config.chatId);
    }
    
    console.log('[processImageWithLLM] Image processing completed');
    return responseBuffer;
    
  } catch (error) {
    console.error('[processImageWithLLM] Error processing image:', error);
    const errorMessage = "I'm sorry, I couldn't analyze this image. Please try again or send a different image.";
    await sendTelegramMessage(config.botApiKey, config.chatId, errorMessage);
    return errorMessage;
  }
}

// Helper to get file URL from Telegram
export async function getFileUrl(botToken: string, fileId: string): Promise<string | null> {
  try {
    const fileInfoResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
    );
    const fileInfo = await fileInfoResponse.json();
    
    if (!fileInfo.ok || !fileInfo.result) {
      return null;
    }
    
    const filePath = fileInfo.result.file_path;
    return `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  } catch (error) {
    console.error(`Error getting file URL: ${error}`);
    return null;
  }
}