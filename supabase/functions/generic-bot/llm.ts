import { streamText, smoothStream } from 'https://esm.sh/ai@4.2.6';
import { createAmazonBedrock } from 'https://esm.sh/@ai-sdk/amazon-bedrock';
import { TavilyClient } from "https://esm.sh/@agentic/tavily";
import { createAISDKTools } from 'https://esm.sh/@agentic/ai-sdk';
import type { Message } from './dal.ts';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | any[];
}

export interface LLMConfig {
  awsRegion?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  tavilyApiKey?: string;
  streamingDelayMs?: number;
}

function createClaudeModel(config: LLMConfig) {
  const bedrock = createAmazonBedrock({
    region: config.awsRegion || Deno.env.get('AWS_REGION'),
    accessKeyId: config.awsAccessKeyId || Deno.env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: config.awsSecretAccessKey || Deno.env.get('AWS_SECRET_ACCESS_KEY')
  });
  
  return bedrock("us.anthropic.claude-3-7-sonnet-20250219-v1:0");
}

function createTools(tavilyApiKey?: string) {
  const tools: any = {};
  
  // Add web search if Tavily is configured
  if (tavilyApiKey) {
    const tavily = new TavilyClient({ apiKey: tavilyApiKey });
    Object.assign(tools, createAISDKTools(tavily));
  }

  return tools;
}

export function messagesToChatMessages(
  messages: Message[],
  systemPrompt: string
): ChatMessage[] {
  const chatMessages: ChatMessage[] = [
    {
      role: "system",
      content: systemPrompt
    }
  ];

  // Convert database messages to chat messages
  for (const msg of messages) {
    chatMessages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.message_text
    });
  }

  return chatMessages;
}

export async function* generateResponse(
  messages: ChatMessage[],
  config: LLMConfig = {}
): AsyncGenerator<string, void, unknown> {
  const model = createClaudeModel(config);
  const tools = createTools(config.tavilyApiKey);

  try {
    const result = await streamText({
      model,
      messages,
      tools,
      maxSteps: 10,
      experimental_transform: smoothStream({
        delayInMs: config.streamingDelayMs || 200,
        chunking: 'line'
      })
    });

    for await (const textPart of result.textStream) {
      yield textPart;
    }
  } catch (error) {
    console.error('Error generating response:', error);
    yield "Sorry, I encountered an error while processing your request. Please try again.";
  }
}

export async function processImageWithLLM(
  imageUrl: string,
  caption: string,
  systemPrompt: string,
  config: LLMConfig = {}
): Promise<string> {
  const model = createClaudeModel(config);

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
      maxSteps: 5
    });

    let fullResponse = "";
    for await (const textPart of result.textStream) {
      fullResponse += textPart;
    }
    
    return fullResponse;
  } catch (error) {
    console.error('Error processing image:', error);
    return "I'm sorry, I couldn't analyze this image. Please try again or send a different image.";
  }
}

export function personalizeWelcomeMessage(welcomeTemplate: string, botName: string, userName?: string): string {
  const name = userName || "there";
  
  // Replace placeholders in the template
  return welcomeTemplate
    .replace(/\{bot_name\}/g, botName)
    .replace(/\{user_name\}/g, name);
}

export function personalizeHelpMessage(helpTemplate: string, botName: string): string {
  // Replace placeholders in the template
  return helpTemplate
    .replace(/\{bot_name\}/g, botName);
} 