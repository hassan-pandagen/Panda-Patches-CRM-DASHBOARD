// ✅ MIGRATED FROM SENDGRID TO MAILJET
// Date: 2026-01-12
// Migration Reason: SendGrid free trial expired

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

    // Add timeout to file download (30 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      // B. Download with timeout
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) return null;

      // C. Size Check (Limit to 10MB)
      const size = Number(response.headers.get('content-length'));
      if (size && size > 10 * 1024 * 1024) {
          console.warn(`Skipping large file (>10MB): ${url}`);
          return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const base64 = encode(new Uint8Array(arrayBuffer));

      return { content: base64, type, isImage, filename: getFileName(url) };
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
        console.warn(`File download timeout (30s): ${url}`);
      } else {
        console.error(`File download error: ${url}`, fetchErr);
      }
      return null;
    }
  } catch (e) { return null; }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ✅ CHECK: Verify Mailjet API keys are configured
    const MAILJET_API_KEY = Deno.env.get('MAILJET_API_KEY');
    const MAILJET_API_SECRET = Deno.env.get('MAILJET_API_SECRET');

    if (!MAILJET_API_KEY || !MAILJET_API_SECRET) {
      console.error('❌ CRITICAL: MAILJET_API_KEY or MAILJET_API_SECRET not set in Supabase secrets');
      throw new Error('Mailjet API keys not configured in Supabase secrets');
    }

    const { to, template_id, dynamic_data, cc } = await req.json();
    const attachments = [];
    const inlineAttachments = [];

    // Deep copy data so we can modify it for the template
    const processedData = JSON.parse(JSON.stringify(dynamic_data));

    console.log(`📧 Processing email for: ${to} using Mailjet template: ${template_id}`);

    // --- A. PROCESS WINNER (The Lightbox Image) ---
    if (processedData.winner_file && processedData.winner_file.url) {
        const file = await fetchFile(processedData.winner_file.url);

        if (file && file.isImage) {
            // IMAGE -> INLINE (Use Content-ID for Lightbox)
            const cid = 'winner_img';
            inlineAttachments.push({
                "Content-type": file.type,
                "Filename": `Preview-${file.filename}`,
                "ContentID": cid,
                "Base64Content": file.content
            });
            processedData.winner_file.preview = `cid:${cid}`;
            processedData.winner_file.is_image = true;
        }
        else if (file && !file.isImage) {
            // PDF -> ATTACHMENT (Never Inline)
            attachments.push({
                "Content-type": file.type,
                "Filename": file.filename,
                "Base64Content": file.content
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
                    "Content-type": file.type,
                    "Filename": file.filename,
                    "Base64Content": file.content
                });
            }
        }
        // CLEANUP: Empty the gallery list so the template doesn't try to render text
        processedData.gallery_files = [];
        processedData.has_gallery = false;
    }

    // --- C. SEND TO MAILJET ---
    // Create Basic Auth header
    const authString = `${MAILJET_API_KEY}:${MAILJET_API_SECRET}`;
    const authHeader = `Basic ${btoa(authString)}`;

    // Build email payload
    const emailPayload: any = {
      "Messages": [
        {
          "From": {
            "Email": "hello@pandapatches.com",
            "Name": "Panda Patches"
          },
          "To": [
            {
              "Email": to
            }
          ],
          "TemplateID": parseInt(template_id),
          "TemplateLanguage": true,
          "Variables": processedData
        }
      ]
    };

    // Add CC if provided
    if (cc) {
      emailPayload.Messages[0].Cc = cc.split(',').map((email: string) => ({ Email: email.trim() }));
    } else {
      emailPayload.Messages[0].Cc = [{ Email: "hello@pandapatches.com" }];
    }

    // Add attachments if any
    if (attachments.length > 0) {
      emailPayload.Messages[0].Attachments = attachments;
    }

    // Add inline attachments if any
    if (inlineAttachments.length > 0) {
      emailPayload.Messages[0].InlinedAttachments = inlineAttachments;
    }

    console.log(`📤 Sending email via Mailjet...`);

    // Add timeout to Mailjet API call (60 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch('https://api.mailjet.com/v3.1/send', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailPayload),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
          const errText = await response.text();
          console.error("Mailjet Error:", errText);
          throw new Error(errText);
      }

      const result = await response.json();
      console.log(`✅ Email sent successfully via Mailjet:`, result);

    } catch (mailjetErr: any) {
      clearTimeout(timeoutId);
      if (mailjetErr instanceof DOMException && mailjetErr.name === 'AbortError') {
        console.error('Mailjet request timeout (60s)');
        throw new Error('Mailjet request timed out');
      }
      throw mailjetErr;
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

  } catch (error: any) {
    // Return 200 even on error so Frontend doesn't spin, but log it.
    console.error("Edge Function Error:", error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  }
});