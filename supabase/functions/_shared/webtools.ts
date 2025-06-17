// ABOUTME: Webtool integration module for dynamically loading and converting webtools to AI SDK tools
// ABOUTME: Fetches webtool metadata and creates callable tools for use with Vercel AI SDK

import { tool } from 'https://esm.sh/ai@4.2.6';
import { z } from 'https://esm.sh/zod';

export interface WebtoolRecord {
  id: string;
  user_email: string;
  bot_id: string;
  name: string;
  url: string;
  description: string;
  context_config: Record<string, any>;
  is_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface WebtoolMetadata {
  name: string;
  description: string;
  actions: Array<{
    name: string;
    description: string;
    schema: any; // JSON Schema
  }>;
  configSchema?: any; // JSON Schema
  defaultConfig?: Record<string, any>;
}

// Convert JSON Schema to Zod schema (simplified version)
function jsonSchemaToZod(schema: any): any {
  // For now, we'll use a simple z.object with z.any() for all properties
  // This avoids the type depth issue while still providing basic validation
  if (!schema || typeof schema !== 'object') {
    return z.any();
  }

  if (schema.type === 'object' && schema.properties) {
    const shape: Record<string, any> = {};
    
    for (const [key, propSchema] of Object.entries(schema.properties as Record<string, any>)) {
      // Create basic schema based on type
      if (propSchema.type === 'string') {
        shape[key] = z.string();
      } else if (propSchema.type === 'number' || propSchema.type === 'integer') {
        shape[key] = z.number();
      } else if (propSchema.type === 'boolean') {
        shape[key] = z.boolean();
      } else if (propSchema.type === 'array') {
        shape[key] = z.array(z.any());
      } else if (propSchema.type === 'object') {
        shape[key] = z.object({});
      } else {
        shape[key] = z.any();
      }
      
      // Make optional if not in required array
      if (!schema.required || !schema.required.includes(key)) {
        shape[key] = shape[key].optional();
      }
    }
    
    return z.object(shape);
  }
  
  return z.any();
}

// Fetch webtool metadata from URL
export async function fetchWebtoolMetadata(url: string): Promise<WebtoolMetadata | null> {
  try {
    console.log(`[fetchWebtoolMetadata] Fetching metadata from: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Generic-Bot/1.0'
      }
    });

    if (!response.ok) {
      console.error(`[fetchWebtoolMetadata] HTTP error ${response.status}: ${response.statusText}`);
      return null;
    }

    const metadata = await response.json();
    
    // Validate metadata structure
    if (!metadata.name || !metadata.description || !Array.isArray(metadata.actions)) {
      console.error('[fetchWebtoolMetadata] Invalid metadata structure');
      return null;
    }

    console.log(`[fetchWebtoolMetadata] Successfully fetched metadata for: ${metadata.name}`);
    return metadata;
  } catch (error) {
    console.error('[fetchWebtoolMetadata] Error fetching metadata:', error);
    return null;
  }
}

// Create an AI SDK tool from webtool metadata
export function createWebtoolAITool(
  webtool: WebtoolRecord,
  metadata: WebtoolMetadata,
  action: { name: string; description: string; schema: any }
) {
  console.log(`[createWebtoolAITool] Creating tool for ${webtool.name}:${action.name}`);
  
  try {
    // Convert JSON Schema to Zod schema
    const zodSchema = jsonSchemaToZod(action.schema);
    
    // Create unique tool name by combining webtool name and action
    const toolName = `${webtool.name}_${action.name}`.replace(/[^a-zA-Z0-9_]/g, '_');
    
    return {
      [toolName]: tool({
        description: `${webtool.description} - ${action.description}`,
        parameters: zodSchema,
        execute: async (params: any) => {
          console.log(`[${toolName}] Executing with params:`, params);
          
          try {
            // Prepare request payload
            const requestBody = {
              session_id: `bot-${webtool.bot_id}-${Date.now()}`,
              action: action.name,
              config: webtool.context_config || metadata.defaultConfig || {},
              payload: params
            };
            
            // Execute webtool
            const response = await fetch(webtool.url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'Generic-Bot/1.0'
              },
              body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
              const errorText = await response.text();
              console.error(`[${toolName}] HTTP error ${response.status}: ${errorText}`);
              return {
                error: `Webtool error: ${response.status} - ${errorText}`
              };
            }
            
            const result = await response.json();
            console.log(`[${toolName}] Execution successful`);
            return result;
            
          } catch (error) {
            console.error(`[${toolName}] Execution error:`, error);
            return {
              error: `Failed to execute webtool: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
          }
        }
      })
    };
  } catch (error) {
    console.error(`[createWebtoolAITool] Error creating tool:`, error);
    return null;
  }
}

// Load all webtools for a bot and convert to AI SDK tools
export async function loadWebtoolsForBot(
  webtools: WebtoolRecord[]
): Promise<Record<string, any>> {
  console.log(`[loadWebtoolsForBot] Loading ${webtools.length} webtools`);
  
  const tools: Record<string, any> = {};
  
  for (const webtool of webtools) {
    if (!webtool.is_enabled) {
      console.log(`[loadWebtoolsForBot] Skipping disabled webtool: ${webtool.name}`);
      continue;
    }
    
    try {
      // Fetch metadata for this webtool
      const metadata = await fetchWebtoolMetadata(webtool.url);
      if (!metadata) {
        console.error(`[loadWebtoolsForBot] Failed to fetch metadata for: ${webtool.name}`);
        continue;
      }
      
      // Create a tool for each action
      for (const action of metadata.actions) {
        const toolDef = createWebtoolAITool(webtool, metadata, action);
        if (toolDef) {
          Object.assign(tools, toolDef);
        }
      }
      
    } catch (error) {
      console.error(`[loadWebtoolsForBot] Error processing webtool ${webtool.name}:`, error);
    }
  }
  
  console.log(`[loadWebtoolsForBot] Loaded ${Object.keys(tools).length} tools`);
  return tools;
}