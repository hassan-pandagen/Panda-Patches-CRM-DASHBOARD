// supabase/functions/_shared/cors.ts - MODERN VERSION

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Or specify your Vercel URL for better security
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};