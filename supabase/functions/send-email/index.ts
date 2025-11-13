/// <reference types="https://esm.sh/v135/@supabase/functions-js@2.4.1/src/edge-runtime.d.ts" />
// supabase/functions/send-email/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, getAllowedOrigin } from '../_shared/cors.ts';

serve(async (req) => {
  const allowedOrigin = getAllowedOrigin(req);

  // If the origin is not allowed, return a CORS error
  if (!allowedOrigin) {
    return new Response('CORS error: Origin not allowed', { status: 403 });
  }

  // This is an OPTIONS request. The browser is checking if the API is available.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...corsHeaders, 'Access-Control-Allow-Origin': allowedOrigin } });
  }

  try {
    // Get the data you sent from the frontend
    const { sendgridPayload } = await req.json()
    
    // Get the secret API key from your Supabase project's environment variables
    const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY')

    if (!SENDGRID_API_KEY) {
      throw new Error('SendGrid API key not found in environment variables.')
    }

    // Make the secure API call from the backend
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
      },
      body: JSON.stringify(sendgridPayload),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`SendGrid API error: ${res.status} ${errorBody}`);
    }

    return new Response(JSON.stringify({ message: "Email sent successfully!" }), {
      headers: { ...corsHeaders, 'Access-Control-Allow-Origin': allowedOrigin, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Access-Control-Allow-Origin': allowedOrigin, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})