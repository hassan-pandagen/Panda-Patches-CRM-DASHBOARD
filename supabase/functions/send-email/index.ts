import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // 1. Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');
    if (!SENDGRID_API_KEY) {
      throw new Error('Missing SENDGRID_API_KEY');
    }

    // 2. Get Data from Frontend
    const { to, template_id, dynamic_data } = await req.json(); // Removed subject/html, added template_id

    // 3. Send to SendGrid (Dynamic Template Mode)
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: to }],
            dynamic_template_data: dynamic_data, // This fills the {{variables}}
          },
        ],
        from: { email: 'hello@pandapatches.com', name: 'Panda Patches' }, // <--- VERIFIED SENDER EMAIL
        template_id: template_id, // <--- This tells SendGrid which design to use
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('SendGrid Error:', errorData);
      throw new Error(`SendGrid API Error: ${JSON.stringify(errorData)}`);
    }

    return new Response(
      JSON.stringify({ message: 'Email sent successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});