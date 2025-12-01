import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 1. Helper: Get Clean Filename
const getFileName = (url: string) => {
  try { return decodeURIComponent(url.split('/').pop() || 'file').split('?')[0]; } 
  catch { return 'file'; }
};

// 2. Helper: Download & Detect Type
const fetchFile = async (url: string) => {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const base64 = encode(new Uint8Array(arrayBuffer));
    
    // Detect Mime
    const cleanUrl = url.split('?')[0].toLowerCase();
    let type = 'application/octet-stream';
    let isImage = false;
    
    if (cleanUrl.match(/\.(jpg|jpeg)$/)) { type = 'image/jpeg'; isImage = true; }
    else if (cleanUrl.match(/\.png$/)) { type = 'image/png'; isImage = true; }
    else if (cleanUrl.match(/\.gif$/)) { type = 'image/gif'; isImage = true; }
    else if (cleanUrl.match(/\.pdf$/)) { type = 'application/pdf'; isImage = false; }
    
    return { content: base64, type, isImage, filename: getFileName(url) };
  } catch (e) { return null; }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { to, template_id, dynamic_data } = await req.json();
    const attachments = [];
    const processedData = JSON.parse(JSON.stringify(dynamic_data));

    console.log(`📧 Processing for: ${to}`);

    // --- A. PROCESS WINNER ---
    if (processedData.winner_file && processedData.winner_file.url) {
        const file = await fetchFile(processedData.winner_file.url);
        if (file) {
            // ✅ NEW SIMPLIFIED LOGIC: Assume the winner is always an image.
            // Process it to be an inline attachment for the Gmail Lightbox.
            const cid = 'winner_img';
            attachments.push({
                content: file.content,
                filename: `Main-${file.filename}`,
                type: file.type,
                disposition: 'inline', // <--- This triggers the Lightbox
                content_id: cid
            });
            // Update the template data to use the Content-ID (cid) for the image source.
            processedData.winner_file.preview = `cid:${cid}`;
            processedData.winner_file.is_image = true;
            processedData.winner_file.file_name = file.filename;
        }
    }

    // --- B. PROCESS GALLERY ---
    if (processedData.gallery_files && Array.isArray(processedData.gallery_files)) {
        for (let i = 0; i < processedData.gallery_files.length; i++) {
            const item = processedData.gallery_files[i];
            const file = await fetchFile(item.url);
            
            if (file) {
                // ✅ NEW LOGIC: ALL gallery files (images or PDFs) become standard attachments.
                attachments.push({
                    content: file.content,
                    filename: file.filename,
                    type: file.type,
                    disposition: 'attachment'
                });
            }
        }
        // ✅ CRITICAL FIX: Clear gallery data from the template data.
        // This ensures the {{#if has_gallery}} block in your SendGrid template is false.
        processedData.gallery_files = [];
        processedData.has_gallery = false;
    }

    // --- C. SEND ---
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SENDGRID_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }], dynamic_template_data: processedData }],
        from: { email: 'hello@pandapatches.com', name: 'Panda Patches' },
        template_id: template_id,
        attachments: attachments,
      }),
    });

    if (!response.ok) throw new Error(await response.text());
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });
  }
});