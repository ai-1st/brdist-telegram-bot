// Telegram adapter interface for testing and production

export interface TelegramMessage {
  chat_id: number | string;
  text: string;
  parse_mode?: string;
  reply_markup?: any;
}

export interface TelegramPhoto {
  chat_id: number | string;
  photo: string;
  caption?: string;
  parse_mode?: string;
}

export interface TelegramChatAction {
  chat_id: number | string;
  action: string;
}

export interface TelegramAdapter {
  sendMessage(message: TelegramMessage): Promise<boolean>;
  sendPhoto(photo: TelegramPhoto): Promise<boolean>;
  sendChatAction(action: TelegramChatAction): Promise<boolean>;
}

// Production adapter that makes real Telegram API calls
export class ProductionTelegramAdapter implements TelegramAdapter {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async sendMessage(message: TelegramMessage): Promise<boolean> {
    if (message.text.length === 0) {
      return false;
    }
    
    const apiUrl = `https://api.telegram.org/bot${this.token}/sendMessage`;
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(message)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error(`Error sending message: ${JSON.stringify(errorData)}`);
        return false;
      }
      return true;
    } catch (error) {
      console.error(`Error sending message: ${error}`);
      return false;
    }
  }

  async sendPhoto(photo: TelegramPhoto): Promise<boolean> {
    const apiUrl = `https://api.telegram.org/bot${this.token}/sendPhoto`;
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(photo)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error(`Error sending photo: ${JSON.stringify(errorData)}`);
        return false;
      }
      return true;
    } catch (error) {
      console.error(`Error sending photo: ${error}`);
      return false;
    }
  }

  async sendChatAction(action: TelegramChatAction): Promise<boolean> {
    const apiUrl = `https://api.telegram.org/bot${this.token}/sendChatAction`;
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(action)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error(`Error sending chat action: ${JSON.stringify(errorData)}`);
        return false;
      }
      return true;
    } catch (error) {
      console.error(`Error sending chat action: ${error}`);
      return false;
    }
  }
}

// Test adapter that collects all calls for inspection
export class TestTelegramAdapter implements TelegramAdapter {
  public calls: Array<{
    type: 'message' | 'photo' | 'chatAction';
    data: TelegramMessage | TelegramPhoto | TelegramChatAction;
    timestamp: number;
  }> = [];

  async sendMessage(message: TelegramMessage): Promise<boolean> {
    this.calls.push({
      type: 'message',
      data: message,
      timestamp: Date.now()
    });
    console.log(`[TEST] sendMessage:`, message);
    return true;
  }

  async sendPhoto(photo: TelegramPhoto): Promise<boolean> {
    this.calls.push({
      type: 'photo',
      data: photo,
      timestamp: Date.now()
    });
    console.log(`[TEST] sendPhoto:`, photo);
    return true;
  }

  async sendChatAction(action: TelegramChatAction): Promise<boolean> {
    this.calls.push({
      type: 'chatAction',
      data: action,
      timestamp: Date.now()
    });
    console.log(`[TEST] sendChatAction:`, action);
    return true;
  }

  // Helper methods for testing
  getMessages(): TelegramMessage[] {
    return this.calls
      .filter(call => call.type === 'message')
      .map(call => call.data as TelegramMessage);
  }

  getLastMessage(): TelegramMessage | undefined {
    const messages = this.getMessages();
    return messages[messages.length - 1];
  }

  getChatActions(): TelegramChatAction[] {
    return this.calls
      .filter(call => call.type === 'chatAction')
      .map(call => call.data as TelegramChatAction);
  }

  clear() {
    this.calls = [];
  }

  printCalls() {
    console.log('\n=== Telegram API Calls ===');
    this.calls.forEach((call, index) => {
      console.log(`\n[${index + 1}] ${call.type}:`);
      console.log(JSON.stringify(call.data, null, 2));
    });
    console.log('========================\n');
  }
}