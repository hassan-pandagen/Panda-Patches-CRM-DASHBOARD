import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 1. Helper: Get Clean Filename
const getFileName = (url: string) => {
  try {
      return decodeURIComponent(url.split('/').pop() || 'file').split('?')[0];
  } catch { return 'file'; }
};

// 2. Helper: Download & Detect Type (STRICT MODE)
const fetchFile = async (url: string) => {
  try {
    // A. Extension Check (Filter out DST/EMB immediately)
    const cleanUrl = url.split('?')[0].toLowerCase();
    let type = '';
    let isImage = false;

    // ONLY allow these types
    if (cleanUrl.match(/\.(jpg|jpeg)$/)) { type = 'image/jpeg'; isImage = true; }
    else if (cleanUrl.match(/\.png$/)) { type = 'image/png'; isImage = true; }
    else if (cleanUrl.match(/\.pdf$/)) { type = 'application/pdf'; isImage = false; }
    else {
        // Skip .dst, .emb, .ai, etc.
        console.log(`Skipping unsupported file type: ${cleanUrl}`);
        return null;
    }

    // B. Download
    const response = await fetch(url);
    if (!response.ok) return null;

    // C. Size Check (Limit to 10MB to prevent SendGrid 400 Error)
    const size = Number(response.headers.get('content-length'));
    if (size && size > 10 * 1024 * 1024) {
        console.warn(`Skipping large file (>10MB): ${url}`);
        return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = encode(new Uint8Array(arrayBuffer));
    
    return { content: base64, type, isImage, filename: getFileName(url) };
  } catch (e) { return null; }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { to, template_id, dynamic_data } = await req.json();
    const attachments = [];

    // Deep copy data so we can modify it for the template
    const processedData = JSON.parse(JSON.stringify(dynamic_data));

    console.log(`📧 Processing email for: ${to}`);

    // --- A. PROCESS WINNER (The Lightbox Image) ---
    if (processedData.winner_file && processedData.winner_file.url) {
        const file = await fetchFile(processedData.winner_file.url);
        
        if (file && file.isImage) {
            // IMAGE -> INLINE (Use Content-ID for Lightbox)
            const cid = 'winner_img';
            attachments.push({
                content: file.content,
                filename: `Preview-${file.filename}`,
                type: file.type,
                disposition: 'inline', // <--- Shows in body
                content_id: cid
            });
            processedData.winner_file.preview = `cid:${cid}`;
            processedData.winner_file.is_image = true;
        }
        else if (file && !file.isImage) {
            // PDF -> ATTACHMENT (Never Inline)
            attachments.push({
                content: file.content,
                filename: file.filename,
                type: file.type,
                disposition: 'attachment'
            });
            // Give it a generic icon in the email body so it's not broken
            processedData.winner_file.preview = "https://cdn-icons-png.flaticon.com/512/337/337946.png";
            processedData.winner_file.is_image = false;
        }
    }

    // --- B. PROCESS GALLERY (Everything else as Attachments) ---
    if (processedData.gallery_files && Array.isArray(processedData.gallery_files)) {
        for (const item of processedData.gallery_files) {
            const file = await fetchFile(item.url);
            
            if (file) {
                // ALL gallery items become standard attachments
                attachments.push({
                    content: file.content,
                    filename: file.filename,
                    type: file.type,
                    disposition: 'attachment' // <--- Downloadable at bottom
                });
            }
        }
        // CLEANUP: Empty the gallery list so the template doesn't try to render text
        processedData.gallery_files = [];
        processedData.has_gallery = false;
    }

    // --- C. SEND TO SENDGRID ---
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SENDGRID_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
            to: [{ email: to }],
            dynamic_template_data: processedData
        }],
        from: { email: 'hello@pandapatches.com', name: 'Panda Patches' },
        template_id: template_id,
        attachments: attachments,
      }),
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error("SendGrid Error:", errText);
        throw new Error(errText);
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

  } catch (error: any) {
    // Return 200 even on error so Frontend doesn't spin, but log it.
    console.error("Edge Function Error:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  }
});