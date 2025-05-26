import { serve } from "https://deno.land/std/http/server.ts";
import { createAmazonBedrock } from 'https://esm.sh/@ai-sdk/amazon-bedrock';
import { z } from 'https://esm.sh/zod';
import { tool } from 'https://esm.sh/ai@4.2.6';
import { TelegramBot, TelegramMessage } from '../lib/telegram-bot-framework.ts';

// Example: Recipe Bot that extends the framework
class RecipeBot extends TelegramBot {
  
  getSystemInstructions(): string {
    return `You are a friendly cooking assistant that helps users discover and prepare delicious recipes.

You must use special commands in your response:
1. To send an image: TG_IMAGE image_url; image_caption
2. To send a conclusion with suggestions: TG_CONCLUSION conclusion_text; suggestion1; suggestion2; suggestion3

When helping with recipes:
- Search for current recipe trends and seasonal ingredients
- Include appetizing food images when possible
- Provide clear, step-by-step instructions
- Suggest ingredient substitutions when helpful
- Consider dietary restrictions mentioned by users

Example response:
"I'll help you make a delicious pasta carbonara! 🍝

<b>Ingredients:</b>
• 400g spaghetti
• 200g pancetta or bacon
• 4 egg yolks
• 100g Pecorino Romano cheese
• Black pepper

TG_IMAGE https://example.com/carbonara.jpg; Classic pasta carbonara

<b>Instructions:</b>
1. Cook spaghetti until al dente
2. Crisp the pancetta in a pan
3. Mix egg yolks with grated cheese
4. Combine hot pasta with pancetta
5. Remove from heat and add egg mixture
6. Toss quickly to create creamy sauce

TG_CONCLUSION Ready to cook?; Show me the video; Suggest wine pairing; Find vegetarian version"

Use HTML formatting and emoji to make responses engaging.`;
  }

  async handleStartCommand(message: TelegramMessage): Promise<void> {
    const welcomeMessage = `👨‍🍳 <b>Welcome to Recipe Bot!</b>

I'm your personal cooking assistant! I can help you:

🍳 <b>Find Recipes</b> - Discover dishes from around the world
🥗 <b>Dietary Options</b> - Vegan, gluten-free, keto, and more
📝 <b>Shopping Lists</b> - Get organized ingredient lists
👩‍🍳 <b>Cooking Tips</b> - Learn techniques and substitutions
🍷 <b>Pairings</b> - Wine and side dish suggestions

Just tell me:
• What ingredients you have
• What type of cuisine you're craving
• Any dietary restrictions
• How much time you have

<i>Let's cook something amazing! 🌟</i>`;

    await this.sendTelegramMessage(message.chat.id, welcomeMessage);
  }

  async handleCommand(command: string, message: TelegramMessage): Promise<boolean> {
    switch (command) {
      case "/quick":
        await this.sendTelegramMessage(
          message.chat.id,
          "⏱️ <b>Quick Recipe Ideas (under 30 minutes):</b>\n\n" +
          "• Stir-fry with vegetables\n" +
          "• Pasta aglio e olio\n" +
          "• Grilled cheese & tomato soup\n" +
          "• Shakshuka\n" +
          "• Greek salad with feta\n\n" +
          "Which one interests you?"
        );
        return true;
        
      case "/vegetarian":
        await this.sendTelegramMessage(
          message.chat.id,
          "🥬 <b>Popular Vegetarian Recipes:</b>\n\n" +
          "• Mushroom risotto\n" +
          "• Eggplant parmesan\n" +
          "• Chickpea curry\n" +
          "• Caprese salad\n" +
          "• Veggie pad thai\n\n" +
          "What sounds good to you?"
        );
        return true;
        
      default:
        return false;
    }
  }

  // Add custom recipe-specific tools
  async getCustomTools(): Promise<any> {
    return {
      save_recipe: tool({
        description: 'Save a recipe to user favorites',
        parameters: z.object({
          recipeName: z.string(),
          ingredients: z.array(z.string()),
          instructions: z.array(z.string()),
          prepTime: z.number().optional(),
          cookTime: z.number().optional()
        }),
        execute: async (params) => {
          // In real implementation, save to database
          console.log('Saving recipe:', params.recipeName);
          return `Recipe "${params.recipeName}" saved to favorites!`;
        }
      }),
      
      nutrition_info: tool({
        description: 'Get nutrition information for a recipe',
        parameters: z.object({
          recipeName: z.string(),
          servings: z.number()
        }),
        execute: async (params) => {
          // In real implementation, calculate nutrition
          return `Nutrition info for ${params.recipeName} (per serving): ~400 calories, 20g protein, 45g carbs, 15g fat`;
        }
      })
    };
  }

  // Override image processing for food photos
  async processImage(imageUrl: string, caption?: string): Promise<any> {
    return [
      {
        type: "text",
        text: caption || "What dish is this? I'll help you recreate it or suggest similar recipes!"
      },
      {
        type: "image",
        image: new URL(imageUrl)
      }
    ];
  }
}

// Bot initialization and handlers (similar to generic bot)
function createBot() {
  const bedrock = createAmazonBedrock({
    region: Deno.env.get('AWS_REGION'),
    accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')
  });
  
  const model = bedrock("us.anthropic.claude-3-7-sonnet-20250219-v1:0");
  
  return new RecipeBot({
    botToken: Deno.env.get('TELEGRAM_BOT_TOKEN') || '',
    model: model,
    tavilyApiKey: Deno.env.get('TAVILY_API_KEY'),
    streamingDelayMs: 200
  });
}

// Main handler (similar structure to generic bot)
if (import.meta.main) {
  serve(async (req) => {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");
    const expectedSecret = Deno.env.get("FUNCTION_SECRET");
    
    if (secret !== expectedSecret) {
      return new Response("Unauthorized", { status: 401 });
    }
    
    if (req.method === 'POST') {
      try {
        const update = await req.json();
        const bot = createBot();
        await bot.handleWebhook(update);
        return new Response("OK", { status: 200 });
      } catch (error) {
        console.error(`Error: ${error}`);
        return new Response("Error", { status: 500 });
      }
    }
    
    return new Response("Method not allowed", { status: 405 });
  });
}