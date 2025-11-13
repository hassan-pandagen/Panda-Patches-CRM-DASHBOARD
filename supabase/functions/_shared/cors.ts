// supabase/functions/_shared/cors.ts

// --- NEW: Define a list of allowed origins ---
const allowedOrigins: (string | undefined)[] = ['http://localhost:5173'];
const vercelUrl = Deno.env.get('VITE_VERCEL_URL');
if (vercelUrl) {
  allowedOrigins.push(vercelUrl);
}

export const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  // --- NEW: Add Allow-Methods for preflight requests ---
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const getAllowedOrigin = (req: Request): string | null => {
  const origin = req.headers.get('Origin');
  if (origin && allowedOrigins.includes(origin)) {
    return origin;
  }
  // You could add more complex logic here for preview deployments, etc.
  return null;
};