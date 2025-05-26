import { serve } from "https://deno.land/std/http/server.ts";
import { createAmazonBedrock } from 'https://esm.sh/@ai-sdk/amazon-bedrock';
import { generateObject, smoothStream, streamText } from 'https://esm.sh/ai@4.2.6';
import { z } from 'https://esm.sh/zod';

// Schema for cargo dimensions
const cargoDimensionsSchema = z.object({
  width: z.number().describe('Ширина груза в метрах'),
  length: z.number().describe('Длина груза в метрах'), 
  depth: z.number().describe('Высота/глубина груза в метрах'),
  weight: z.number().describe('Вес груза в килограммах'),
  description: z.string().describe('Описание груза'),
  items: z.array(z.object({
    name: z.string().describe('Название предмета'),
    quantity: z.number().describe('Количество'),
    estimatedWeight: z.number().describe('Приблизительный вес одного предмета в кг')
  })).optional().describe('Список предметов на изображении')
});

// System prompt for the cargo bot
const SYSTEM_PROMPT = `Ты помощник по расчету стоимости доставки грузов. Твоя задача:

1. Анализировать изображения грузов, которые присылают пользователи
2. Определять размеры (ширина, длина, высота) и вес груза
3. Рассчитывать стоимость доставки по формуле: max(ширина * длина * высота * 1000, вес)
4. Общаться исключительно на русском языке
5. Быть вежливым и профессиональным

При анализе изображений учитывай:
- Используй визуальные подсказки для оценки размеров (сравнение с известными объектами)
- Если точные размеры определить сложно, дай приблизительную оценку
- Учитывай тип груза для более точной оценки веса
- Если на изображении несколько предметов, учти их все

Формат ответов:
- Сначала опиши, что видишь на изображении
- Затем предоставь оценку размеров и веса
- Рассчитай стоимость доставки
- Дай рекомендации по упаковке (если необходимо)

Используй специальные команды:
- TG_IMAGE url; caption - для отправки изображений
- TG_CONCLUSION текст; предложение1; предложение2; предложение3 - для завершения с предложениями

Всегда используй HTML для форматирования текста.`;

// Initialize Claude model
function getModel() {
  const bedrock = createAmazonBedrock({
    region: Deno.env.get('AWS_REGION'),
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')
  });
  return bedrock("us.anthropic.claude-3-7-sonnet-20250219-v1:0");
}

// Send message to Telegram
async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: any) {
  const botToken = Deno.env.get("CARGO_BOT_API_TOKEN");
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

// Send photo to Telegram
async function sendTelegramPhoto(chatId: number, photoUrl: string, caption?: string) {
  const botToken = Deno.env.get("CARGO_BOT_API_TOKEN");
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

// Send chat action (typing indicator)
function sendChatAction(chatId: number, action: string) {
  const botToken = Deno.env.get("CARGO_BOT_API_TOKEN");
  const url = `https://api.telegram.org/bot${botToken}/sendChatAction`;
  
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      action: action
    })
  }).catch(error => console.error(`Error sending chat action: ${error}`));
}

// Handle /start command
async function handleStartCommand(message: any) {
  const welcomeMessage = `🚚 <b>Добро пожаловать в Cargo Bot!</b>

Я помогу вам рассчитать стоимость доставки груза.

<b>Как это работает:</b>
1. Отправьте мне фотографию вашего груза
2. Я проанализирую изображение и определю размеры
3. Рассчитаю стоимость доставки

<b>Формула расчета:</b>
Стоимость = max(Ш × Д × В × 1000, Вес)

где:
• Ш - ширина в метрах
• Д - длина в метрах  
• В - высота в метрах
• Вес - в килограммах

📸 Отправьте фото груза для начала!`;

  await sendTelegramMessage(message.chat.id, welcomeMessage);
}

// Handle text messages
async function handleTextMessage(message: any) {
  await sendTelegramMessage(
    message.chat.id,
    "📸 Пожалуйста, отправьте фотографию груза для расчета стоимости доставки."
  );
}

// Handle image messages
async function handleImageMessage(message: any) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  
  console.log(`[handleImageMessage] Processing image from user ${userId}`);
  
  try {
    // Send initial acknowledgment
    await sendTelegramMessage(chatId, "🔍 Анализирую изображение...");
    sendChatAction(chatId, "typing");
    
    // Get the largest photo
    const photoArray = message.photo;
    const largestPhoto = photoArray[photoArray.length - 1];
    const fileId = largestPhoto.file_id;
    
    // Get file info from Telegram
    const botToken = Deno.env.get("CARGO_BOT_API_TOKEN");
    const fileInfoResponse = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    const fileInfo = await fileInfoResponse.json();
    
    if (!fileInfo.ok || !fileInfo.result) {
      throw new Error("Failed to get file info from Telegram");
    }
    
    // Get the file URL
    const filePath = fileInfo.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    
    // Analyze image with Claude to extract dimensions
    const dimensionAnalysis = await generateObject({
      model: getModel(),
      schema: cargoDimensionsSchema,
      messages: [
        {
          role: "system",
          content: "Ты эксперт по оценке размеров и веса грузов. Анализируй изображение и предоставь точную оценку размеров в метрах и веса в килограммах."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: message.caption || "Проанализируй этот груз и определи его размеры и вес."
            },
            {
              type: "image",
              image: new URL(fileUrl)
            }
          ]
        }
      ]
    });
    
    const dimensions = dimensionAnalysis.object;
    
    // Calculate shipping cost
    const volumeCost = dimensions.width * dimensions.length * dimensions.depth * 1000;
    const weightCost = dimensions.weight;
    const shippingCost = Math.max(volumeCost, weightCost);
    
    // Format the response
    const responseText = `📦 <b>Анализ груза завершен</b>

<b>Описание:</b> ${dimensions.description}

<b>Габариты:</b>
• Ширина: ${dimensions.width.toFixed(2)} м
• Длина: ${dimensions.length.toFixed(2)} м
• Высота: ${dimensions.depth.toFixed(2)} м
• Объем: ${(dimensions.width * dimensions.length * dimensions.depth).toFixed(3)} м³

<b>Вес:</b> ${dimensions.weight.toFixed(1)} кг

<b>Расчет стоимости:</b>
• По объему: ${dimensions.width.toFixed(2)} × ${dimensions.length.toFixed(2)} × ${dimensions.depth.toFixed(2)} × 1000 = ${volumeCost.toFixed(0)} ₽
• По весу: ${dimensions.weight.toFixed(1)} кг = ${weightCost.toFixed(0)} ₽

💰 <b>Итоговая стоимость: ${shippingCost.toFixed(0)} ₽</b>`;

    await sendTelegramMessage(chatId, responseText);
    
    // Add item details if available
    if (dimensions.items && dimensions.items.length > 0) {
      let itemsText = "\n<b>Детализация предметов:</b>\n";
      dimensions.items.forEach(item => {
        itemsText += `• ${item.name} - ${item.quantity} шт. (~${item.estimatedWeight} кг/шт.)\n`;
      });
      await sendTelegramMessage(chatId, itemsText);
    }
    
    // Send conclusion with suggestions
    const suggestions = [
      "📸 Рассчитать другой груз",
      "📋 Советы по упаковке",
      "📞 Связаться с оператором"
    ];
    
    const replyMarkup = {
      keyboard: suggestions.map(s => [{ text: s }]),
      resize_keyboard: true,
      one_time_keyboard: true
    };
    
    await sendTelegramMessage(
      chatId,
      "Что вы хотите сделать дальше?",
      replyMarkup
    );
    
  } catch (error) {
    console.error(`Error processing image: ${error}`);
    await sendTelegramMessage(
      chatId,
      "❌ Извините, не удалось обработать изображение. Пожалуйста, попробуйте еще раз или отправьте другую фотографию."
    );
  }
}

// Handle special button responses
async function handleSpecialResponse(message: any) {
  const text = message.text;
  const chatId = message.chat.id;
  
  if (text === "📸 Рассчитать другой груз") {
    await sendTelegramMessage(chatId, "📸 Отправьте фотографию нового груза для расчета.");
  } else if (text === "📋 Советы по упаковке") {
    const packingTips = `📋 <b>Советы по упаковке груза:</b>

1. <b>Используйте подходящую тару</b>
   • Картонные коробки для легких грузов
   • Деревянные ящики для тяжелых предметов
   • Паллеты для крупногабаритных грузов

2. <b>Защитите содержимое</b>
   • Воздушно-пузырьковая пленка для хрупких предметов
   • Пенопласт или поролон для амортизации
   • Стретч-пленка для фиксации

3. <b>Маркировка</b>
   • Укажите "Хрупкое" при необходимости
   • Стрелки "Верх" для правильной ориентации
   • Контактные данные отправителя и получателя

4. <b>Оптимизация объема</b>
   • Разберите мебель, если возможно
   • Заполните пустоты мягким материалом
   • Группируйте мелкие предметы

📸 Отправьте фото для расчета нового груза!`;
    
    await sendTelegramMessage(chatId, packingTips);
  } else if (text === "📞 Связаться с оператором") {
    await sendTelegramMessage(
      chatId,
      "📞 <b>Контакты службы поддержки:</b>\n\nТелефон: +7 (800) 123-45-67\nEmail: support@cargo-bot.ru\nВремя работы: 9:00 - 21:00 МСК"
    );
  }
}

// Process webhook message
async function processWebhookMessage(message: any) {
  console.log(`[processWebhookMessage] Processing message type: ${message.text ? 'text' : message.photo ? 'photo' : 'other'}`);
  
  // Handle commands
  if (message.text && message.text.startsWith("/")) {
    if (message.text === "/start") {
      await handleStartCommand(message);
    } else {
      await sendTelegramMessage(
        message.chat.id,
        "Неизвестная команда. Используйте /start для начала."
      );
    }
  } else if (message.text) {
    // Check if it's a special button response
    if (["📸 Рассчитать другой груз", "📋 Советы по упаковке", "📞 Связаться с оператором"].includes(message.text)) {
      await handleSpecialResponse(message);
    } else {
      await handleTextMessage(message);
    }
  } else if (message.photo) {
    await handleImageMessage(message);
  } else if (message.document && message.document.mime_type && message.document.mime_type.startsWith('image/')) {
    // Handle image documents
    const imageMessage = {
      ...message,
      photo: [{
        file_id: message.document.file_id,
        file_unique_id: message.document.file_unique_id,
        file_size: message.document.file_size
      }]
    };
    await handleImageMessage(imageMessage);
  } else {
    await sendTelegramMessage(
      message.chat.id,
      "📸 Пожалуйста, отправьте фотографию груза для расчета стоимости доставки."
    );
  }
}

// Set webhook function
async function setTelegramWebhook(): Promise<Response> {
  try {
    const botToken = Deno.env.get("CARGO_BOT_API_TOKEN");
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
    const webhookUrl = `https://${projectRef}.supabase.co/functions/v1/cargo?secret=${functionSecret}`;
    
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

// Main handler
if (import.meta.main) {
  serve(async (req) => {
    console.log(`\n[WEBHOOK REQUEST] ${new Date().toISOString()}`);
    console.log(`[WEBHOOK] Method: ${req.method}, URL: ${req.url}`);
    
    try {
      const url = new URL(req.url);
      const pathname = url.pathname;
      
      // Handle set-webhook endpoint
      if (pathname.endsWith('/set-webhook') && (req.method === 'POST' || req.method === 'GET')) {
        console.log(`[WEBHOOK] Handling set-webhook endpoint`);
        const secret = url.searchParams.get("secret");
        const expectedSecret = Deno.env.get("FUNCTION_SECRET");
        if (secret !== expectedSecret) {
          return new Response("Unauthorized", { status: 401 });
        }
        return await setTelegramWebhook();
      }
      
      // Handle webhook endpoint
      if (req.method === 'POST' && pathname.endsWith('/cargo')) {
        console.log(`[WEBHOOK] Handling Telegram webhook endpoint`);
        
        // Verify secret
        const secret = url.searchParams.get("secret");
        const expectedSecret = Deno.env.get("FUNCTION_SECRET");
        
        if (secret !== expectedSecret) {
          console.error(`[WEBHOOK] Unauthorized request`);
          return new Response("Unauthorized", { status: 401 });
        }
        
        // Parse webhook data
        const update = await req.json();
        console.log(`[WEBHOOK] Update received:`, update);
        
        // Handle message
        const message = update.message;
        if (!message) {
          console.log(`[WEBHOOK] No message in update`);
          return new Response("OK", { status: 200 });
        }
        
        await processWebhookMessage(message);
        
        return new Response("OK", { status: 200 });
      }
      
      return new Response("Method not allowed", { status: 405 });
      
    } catch (error) {
      console.error(`[WEBHOOK ERROR]`, error);
      return new Response("Error processing request", { status: 500 });
    }
  });
}