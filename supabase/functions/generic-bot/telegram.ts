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

export interface ReplyMarkup {
  keyboard?: Array<Array<{ text: string }>>;
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  replyMarkup?: ReplyMarkup
): Promise<boolean> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
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

export async function sendTelegramPhoto(
  botToken: string,
  chatId: number,
  photoUrl: string,
  caption?: string
): Promise<boolean> {
  const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
  
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

export async function sendChatAction(
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

export async function setWebhook(
  botToken: string,
  webhookUrl: string
): Promise<{ success: boolean; response: any }> {
  const telegramApiUrl = `https://api.telegram.org/bot${botToken}/setWebhook`;
  
  try {
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
    
    return {
      success: result.ok,
      response: result
    };
  } catch (error) {
    console.error(`Error setting webhook: ${error}`);
    return {
      success: false,
      response: { error: error.message }
    };
  }
}

export function processStreamLine(
  line: string,
  botToken: string,
  chatId: number
): void {
  if (!line) return;

  // Process TG_IMAGE commands
  if (line.startsWith("TG_IMAGE ") && line.includes(";")) {
    const parts = line.replace("TG_IMAGE ", "").split(";");
    if (parts.length >= 1) {
      const imageUrl = parts[0].trim();
      const caption = parts[1]?.trim() || "";
      
      sendTelegramPhoto(botToken, chatId, imageUrl, caption);
      sendChatAction(botToken, chatId);
    }
  }
  // Process TG_CONCLUSION commands
  else if (line.startsWith("TG_CONCLUSION ") && line.includes(";")) {
    const parts = line.replace("TG_CONCLUSION ", "").split(";");
    if (parts.length >= 2) {
      const conclusionText = parts[0].trim();
      const suggestions = parts.slice(1).map(s => s.trim()).filter(s => s.length > 0);
      
      const replyMarkup: ReplyMarkup = {
        keyboard: suggestions.map(suggestion => [{ text: suggestion }]),
        resize_keyboard: true,
        one_time_keyboard: true
      };
      
      sendTelegramMessage(botToken, chatId, conclusionText, replyMarkup);
    }
  }
  // Process regular text
  else {
    sendTelegramMessage(botToken, chatId, line);
    sendChatAction(botToken, chatId);
  }
} 