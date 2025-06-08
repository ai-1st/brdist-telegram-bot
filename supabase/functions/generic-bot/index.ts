// Import and re-export the main handler
import { handleSetWebhook, handleWebhook } from './handler.ts';

// CORS headers for cross-origin requests
function getCorsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
    'Access-Control-Max-Age': '86400', // 24 hours
  };
}

// Add CORS headers to a response
async function addCorsHeaders(response: Response): Promise<Response> {
  const headers = new Headers(response.headers);
  Object.entries(getCorsHeaders()).forEach(([key, value]) => {
    headers.set(key, value);
  });
  
  // Clone the response to avoid "body already read" errors
  const responseClone = response.clone();
  
  return new Response(responseClone.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

// Handle preflight OPTIONS requests
function handlePreflight(request: Request): Response {
  console.log('[CORS] Handling preflight OPTIONS request');
  console.log('[CORS] Origin:', request.headers.get('Origin'));
  console.log('[CORS] Requested headers:', request.headers.get('Access-Control-Request-Headers'));
  console.log('[CORS] Requested method:', request.headers.get('Access-Control-Request-Method'));
  
  const corsHeaders = getCorsHeaders();
  console.log('[CORS] Sending CORS headers:', corsHeaders);
  
  return new Response(null, {
    status: 200,
    headers: corsHeaders
  });
}

// Create a JSON response with CORS headers
export function createCorsJsonResponse(data: any, status: number = 200): Response {
  const headers = new Headers(getCorsHeaders());
  headers.set('Content-Type', 'application/json');
  
  return new Response(JSON.stringify(data), {
    status,
    headers
  });
}

console.log('Starting server 1...');
// Main handler
if (import.meta.main) {
  console.log('Starting server 2...');
  Deno.serve(async (request) => {
    console.log(`\n[WEBHOOK REQUEST] ${new Date().toISOString()}`);
    console.log(`[WEBHOOK] Method: ${request.method}`);
    console.log(`[WEBHOOK] URL: ${request.url}`);
    console.log(`[WEBHOOK] Origin: ${request.headers.get('origin') || 'none'}`);
    console.log(`[WEBHOOK] Headers: ${JSON.stringify(Object.fromEntries(request.headers.entries()), null, 2)}`);
    
    const url = new URL(request.url);
    const pathname = url.pathname;

    console.log(`[${new Date().toISOString()}] ${request.method} ${pathname}`);

    try {
      // Handle preflight OPTIONS requests
      if (request.method === 'OPTIONS') {
        return handlePreflight(request);
      }

      // Handle set-webhook endpoint (returns response with CORS headers)
      if (pathname.endsWith('/set-webhook')) {
        return await handleSetWebhook(request);
      }
      
      // Handle webhook (regular Telegram webhook, no CORS needed)
      if (request.method === 'POST') {
        return await handleWebhook(request);
      }
      
      // Method not allowed
      return createCorsJsonResponse({
        error: "Method not allowed"
      }, 405);

    } catch (error) {
      console.error('Server error:', error);
      return createCorsJsonResponse({
        error: "Internal Server Error"
      }, 500);
    }
  });
} 