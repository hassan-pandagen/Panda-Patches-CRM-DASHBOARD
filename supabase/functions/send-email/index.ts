import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    const { to, template_id, dynamic_data } = requestBody;

    if (!to || !template_id) throw new Error('Missing to or template_id');

    const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');
    
    // ✅ CLONE dynamic_data to avoid mutating the original
    const processedData = JSON.parse(JSON.stringify(dynamic_data || {}));
    const attachments = [];
    
    if (processedData.files_list && Array.isArray(processedData.files_list)) {
      console.log(`📦 Processing ${processedData.files_list.length} files...`);

      // Process each file sequentially
      for (let i = 0; i < processedData.files_list.length; i++) {
        const file = processedData.files_list[i];
        
        try {
          console.log(`📥 [${i}] Downloading: ${file.name} (${file.is_image ? 'IMAGE' : 'FILE'})`);
          console.log(`    Original URL: ${file.url}`);
          
          // 1. Fetch the file from Supabase
          const fileResp = await fetch(file.url);
          if (!fileResp.ok) {
            console.error(`❌ Failed to fetch ${file.url}: ${fileResp.status}`);
            continue;
          }
          
          // 2. Convert to ArrayBuffer then Base64
          const arrayBuffer = await fileResp.arrayBuffer();
          const base64Content = encode(new Uint8Array(arrayBuffer));
          
          console.log(`    File size: ${(arrayBuffer.byteLength / 1024).toFixed(2)} KB`);

          // 3. Process based on file type
          if (file.is_image) {
            // Generate unique content ID
            const contentId = `img${i}${Date.now()}`;

            // Determine MIME type
            let mimeType = 'image/jpeg';
            const lower = (file.name || file.url || '').toLowerCase();
            if (lower.includes('.png')) mimeType = 'image/png';
            else if (lower.includes('.gif')) mimeType = 'image/gif';
            else if (lower.includes('.webp')) mimeType = 'image/webp';

            // Add as inline attachment
            attachments.push({
              content: base64Content,
              filename: file.name,
              type: mimeType,
              disposition: "inline",
              content_id: contentId
            });

            // ✅ CRITICAL: Update the file reference in processedData
            processedData.files_list[i].preview = `cid:${contentId}`;
            processedData.files_list[i].url = `cid:${contentId}`;
            
            console.log(`✅ [${i}] Attached as inline: cid:${contentId}`);

          } else {
            // PDF/File attachment
            attachments.push({
              content: base64Content,
              filename: file.name,
              type: "application/pdf",
              disposition: "attachment"
            });
            
            console.log(`✅ [${i}] Attached as file: ${file.name}`);
          }

        } catch (err) {
          console.error(`❌ Error processing file ${i}:`, err.message);
        }
      }
    }

    console.log(`📧 Total attachments: ${attachments.length}`);
    
    // Debug: Show what we're sending to SendGrid
    if (processedData.files_list) {
      console.log(`🔍 Processed files_list:`);
      processedData.files_list.forEach((f, idx) => {
        console.log(`   [${idx}] ${f.name}: preview=${f.preview}, url=${f.url}`);
      });
    }

    // --- PREPARE SENDGRID PAYLOAD ---
    const payload = {
      personalizations: [
        {
          to: [{ email: to }],
          dynamic_template_data: processedData, // ✅ Use processed data with CIDs
        },
      ],
      from: { 
        email: 'hello@pandapatches.com', 
        name: 'Panda Patches' 
      },
      template_id: template_id,
      attachments: attachments,
      asm: {
        group_id: 28562,
        groups_to_display: [28562],
      },
    };

    // --- SEND ---
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`SendGrid Error (${response.status}): ${txt}`);
    }

    console.log(`✅ Email sent successfully!`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        attachments_count: attachments.length 
      }), 
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 200 
      }
    );

  } catch (error: any) {
    console.error('💥 ERROR:', error.message);
    console.error('💥 STACK:', error.stack);
    return new Response(
      JSON.stringify({ error: error.message }), 
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 400 
      }
    );
  }
});