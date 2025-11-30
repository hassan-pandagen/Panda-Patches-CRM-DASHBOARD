import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const getFileType = (url: string) => {
  const cleanUrl = url.split('?')[0].toLowerCase();
  if (cleanUrl.match(/\.(jpeg|jpg)$/)) return { type: 'image/jpeg', isImage: true };
  if (cleanUrl.endsWith('.png')) return { type: 'image/png', isImage: true };
  if (cleanUrl.endsWith('.gif')) return { type: 'image/gif', isImage: true };
  if (cleanUrl.endsWith('.webp')) return { type: 'image/webp', isImage: true }; // Re-added for optimization
  if (cleanUrl.endsWith('.pdf')) return { type: 'application/pdf', isImage: false };
  return { type: 'application/octet-stream', isImage: false };
};

const fetchFileAsBase64 = async (url: string) => {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const base64 = encode(new Uint8Array(arrayBuffer));
    return { content: base64, ...getFileType(url) };
  } catch (e) { return null; }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { to, template_id, dynamic_data } = await req.json();
    const attachments = [];
    const processedData = JSON.parse(JSON.stringify(dynamic_data));

    console.log(`Processing Order for: ${to}`);

    // --- 1. PROCESS HERO FILE (The Winner) ---
    if (processedData.hero_file && processedData.hero_file.url) {
        const fileData = await fetchFileAsBase64(processedData.hero_file.url);
        if (fileData) {
            if (fileData.isImage) {
                // Inline Image
                const cid = 'hero_img_cid';
                attachments.push({
                    content: fileData.content,
                    filename: 'main-proof.jpg',
                    type: fileData.type,
                    disposition: 'inline',
                    content_id: cid
                });
                processedData.hero_file.preview = `cid:${cid}`;
            } else {
                // PDF Attachment
                attachments.push({
                    content: fileData.content,
                    filename: 'Main-Document.pdf',
                    type: fileData.type,
                    disposition: 'attachment'
                });
            }
        }
    }

    // --- 2. PROCESS GALLERY FILES ---
    if (processedData.gallery_files && Array.isArray(processedData.gallery_files)) {
        for (let i = 0; i < processedData.gallery_files.length; i++) {
            const item = processedData.gallery_files[i];
            const fileData = await fetchFileAsBase64(item.url);
            
            if (fileData) {
                if (fileData.isImage) {
                    const cid = `gal_img_${i}`;
                    attachments.push({
                        content: fileData.content,
                        filename: `gallery-${i}.jpg`,
                        type: fileData.type,
                        disposition: 'inline',
                        content_id: cid
                    });
                    processedData.gallery_files[i].preview = `cid:${cid}`;
                } else {
                    attachments.push({
                        content: fileData.content,
                        filename: `file-${i}.pdf`,
                        type: fileData.type,
                        disposition: 'attachment'
                    });
                }
            }
        }
    }

    // --- 3. SEND ---
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

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});