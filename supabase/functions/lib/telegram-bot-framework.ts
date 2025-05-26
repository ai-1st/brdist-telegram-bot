import { streamText, smoothStream, tool } from 'https://esm.sh/ai@4.2.6';
import { z } from 'https://esm.sh/zod';
import { TavilyClient } from "https://esm.sh/@agentic/tavily";
import { createAISDKTools } from 'https://esm.sh/@agentic/ai-sdk';

// Types
export interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
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

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | any[];
}

export interface BotConfig {
  botToken: string;
  model: any; // AI SDK model instance
  tavilyApiKey?: string;
  streamingDelayMs?: number;
}

// Base Telegram Bot Framework
export abstract class TelegramBot {
  protected config: BotConfig;
  protected tavily?: TavilyClient;

  constructor(config: BotConfig) {
    this.config = config;
    if (config.tavilyApiKey) {
      this.tavily = new TavilyClient({ apiKey: config.tavilyApiKey });
    }
  }

  // Core methods that can be overridden

  /**
   * Get system instructions for the bot
   */
  getSystemInstructions(): string {
    return `You are a helpful AI assistant that can search the web and provide informative responses.

You must use special commands in your response:
1. To send an image: TG_IMAGE image_url; image_caption
2. To send a conclusion with suggestions: TG_CONCLUSION conclusion_text; suggestion1; suggestion2; suggestion3

Example of using commands:
"Here is information about your topic.
TG_IMAGE https://example.com/image.jpg; A relevant image showing the concept
TG_CONCLUSION What else would you like to know?; Tell me more; Show examples; Explain differently"

Use HTML for text formatting:
<b>bold</b>, <i>italic</i>, <u>underlined</u>, <s>strikethrough</s>

IMPORTANT: Use search to get up-to-date information when needed.
Respond concisely and always end with a TG_CONCLUSION command.`;
  }

  /**
   * Load chat history for a user/chat
   */
  async loadChatHistory(userId: number, chatId: number): Promise<ChatMessage[]> {
    // Default implementation returns empty history
    // Override this to implement persistence
    return [];
  }

  /**
   * Save a message to chat history
   */
  async addChatHistory(userId: number, chatId: number, message: ChatMessage): Promise<void> {
    // Default implementation does nothing
    // Override this to implement persistence
  }

  /**
   * Get tools available to the AI model
   */
  async getTools(): Promise<any> {
    const tools: any = {};
    
    // Add web search if Tavily is configured
    if (this.tavily) {
      Object.assign(tools, createAISDKTools(this.tavily));
    }

    // Add any custom tools
    const customTools = await this.getCustomTools();
    Object.assign(tools, customTools);

    return tools;
  }

  /**
   * Override this to add custom tools
   */
  async getCustomTools(): Promise<any> {
    return {};
  }

  /**
   * Process an image and return a text description or analysis
   */
  async processImage(imageUrl: string, caption?: string): Promise<string> {
    // Default implementation just returns the caption or a generic message
    return caption || "Image received";
  }

  /**
   * Handle /start command
   */
  async handleStartCommand(message: TelegramMessage): Promise<void> {
    const welcomeMessage = `<b>Welcome!</b> 👋

I'm an AI assistant that can help you with various tasks.

I can:
• Answer your questions
• Search the web for current information
• Provide images when relevant
• Suggest related topics

Just send me a message to get started!`;

    await this.sendTelegramMessage(message.chat.id, welcomeMessage);
  }

  /**
   * Handle custom commands (override this)
   */
  async handleCommand(command: string, message: TelegramMessage): Promise<boolean> {
    // Return true if command was handled, false otherwise
    return false;
  }

  /**
   * Send a message to Telegram
   */
  async sendTelegramMessage(chatId: number, text: string, replyMarkup?: any): Promise<boolean> {
    const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;
    
    const body: any = {
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
      return result.ok;
    } catch (error) {
      console.error(`Error sending message: ${error}`);
      return false;
    }
  }

  /**
   * Send a photo to Telegram
   */
  async sendTelegramPhoto(chatId: number, photoUrl: string, caption?: string): Promise<boolean> {
    const url = `https://api.telegram.org/bot${this.config.botToken}/sendPhoto`;
    
    const body: any = {
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
      return result.ok;
    } catch (error) {
      console.error(`Error sending photo: ${error}`);
      return false;
    }
  }

  /**
   * Send chat action (typing indicator)
   */
  async sendChatAction(chatId: number, action: string = "typing"): Promise<void> {
    const url = `https://api.telegram.org/bot${this.config.botToken}/sendChatAction`;
    
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

  /**
   * Get file URL from Telegram file ID
   */
  protected async getFileUrl(fileId: string): Promise<string | null> {
    try {
      const fileInfoResponse = await fetch(
        `https://api.telegram.org/bot${this.config.botToken}/getFile?file_id=${fileId}`
      );
      const fileInfo = await fileInfoResponse.json();
      
      if (!fileInfo.ok || !fileInfo.result) {
        return null;
      }
      
      const filePath = fileInfo.result.file_path;
      return `https://api.telegram.org/file/bot${this.config.botToken}/${filePath}`;
    } catch (error) {
      console.error(`Error getting file URL: ${error}`);
      return null;
    }
  }

  /**
   * Main message processing with streaming
   */
  async processMessage(message: TelegramMessage): Promise<void> {
    const userId = message.from.id;
    const chatId = message.chat.id;
    
    // Handle commands
    if (message.text?.startsWith("/")) {
      if (message.text === "/start") {
        await this.handleStartCommand(message);
        return;
      }
      
      // Try custom command handler
      const handled = await this.handleCommand(message.text, message);
      if (handled) return;
      
      // Unknown command
      await this.sendTelegramMessage(
        chatId,
        "Unknown command. Send /start to see available options."
      );
      return;
    }

    // Show typing indicator
    await this.sendChatAction(chatId);

    try {
      // Handle image messages
      let userContent: string | any[] = message.text || "";
      
      if (message.photo || (message.document?.mime_type?.startsWith('image/'))) {
        const fileId = message.photo 
          ? message.photo[message.photo.length - 1].file_id
          : message.document!.file_id;
          
        const imageUrl = await this.getFileUrl(fileId);
        if (imageUrl) {
          const imageAnalysis = await this.processImage(imageUrl, message.caption);
          userContent = imageAnalysis;
        }
      }

      // Load chat history
      const history = await this.loadChatHistory(userId, chatId);
      
      // Build messages array
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: this.getSystemInstructions()
        },
        ...history,
        {
          role: "user",
          content: userContent
        }
      ];

      // Get available tools
      const tools = await this.getTools();

      // Stream response from AI
      const result = await streamText({
        model: this.config.model,
        messages,
        tools,
        maxSteps: 10,
        experimental_transform: smoothStream({
          delayInMs: this.config.streamingDelayMs || 200,
          chunking: 'line'
        })
      });

      // Process streaming response
      let responseBuffer = "";
      let lineBuffer = "";
      
      for await (const textPart of result.textStream) {
        responseBuffer += textPart;
        lineBuffer += textPart;
        
        // Process complete lines
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || "";
        
        for (const line of lines) {
          await this.processStreamLine(line.trim(), chatId);
        }
      }
      
      // Process any remaining content
      if (lineBuffer.trim()) {
        await this.processStreamLine(lineBuffer.trim(), chatId);
      }

      // Save the complete response to history
      await this.addChatHistory(userId, chatId, {
        role: "user",
        content: message.text || userContent
      });
      
      await this.addChatHistory(userId, chatId, {
        role: "assistant",
        content: responseBuffer
      });

    } catch (error) {
      console.error(`Error processing message: ${error}`);
      await this.sendTelegramMessage(
        chatId,
        "Sorry, an error occurred while processing your message. Please try again."
      );
    }
  }

  /**
   * Process a single line from the streaming response
   */
  protected async processStreamLine(line: string, chatId: number): Promise<void> {
    if (!line) return;

    // Process TG_IMAGE commands
    if (line.startsWith("TG_IMAGE ") && line.includes(";")) {
      const parts = line.replace("TG_IMAGE ", "").split(";");
      if (parts.length >= 1) {
        const imageUrl = parts[0].trim();
        const caption = parts[1]?.trim() || "";
        
        await this.sendTelegramPhoto(chatId, imageUrl, caption);
        await this.sendChatAction(chatId);
      }
    }
    // Process TG_CONCLUSION commands
    else if (line.startsWith("TG_CONCLUSION ") && line.includes(";")) {
      const parts = line.replace("TG_CONCLUSION ", "").split(";");
      if (parts.length >= 2) {
        const conclusionText = parts[0].trim();
        const suggestions = parts.slice(1).map(s => s.trim()).filter(s => s.length > 0);
        
        const replyMarkup = {
          keyboard: suggestions.map(suggestion => [{ text: suggestion }]),
          resize_keyboard: true,
          one_time_keyboard: true
        };
        
        await this.sendTelegramMessage(chatId, conclusionText, replyMarkup);
      }
    }
    // Process regular text
    else {
      await this.sendTelegramMessage(chatId, line);
      await this.sendChatAction(chatId);
    }
  }

  /**
   * Main webhook handler
   */
  async handleWebhook(update: any): Promise<void> {
    const message = update.message;
    if (!message) return;

    await this.processMessage(message);
  }
}