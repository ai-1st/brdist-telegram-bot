// ABOUTME: Shared CORS headers for all Supabase edge functions
// ABOUTME: Provides consistent cross-origin resource sharing configuration

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};