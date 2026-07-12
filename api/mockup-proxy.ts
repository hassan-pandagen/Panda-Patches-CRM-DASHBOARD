// api/mockup-proxy.ts
// Thin server-side proxy for the Patch Generator page. Forwards the browser's
// multipart/form-data mockup request to the VPS engine's synchronous `POST /mockup`
// endpoint, injecting `Authorization: Bearer <DIGITIZE_API_KEY>` server-side so the key
// never reaches the client. Mirrors the pattern of api/sentry-proxy.ts.
//
// The browser calls same-origin `/api/mockup-proxy`; it never sees the VPS URL or the key.
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Stream the raw multipart body through untouched — do NOT let Vercel parse it (that would
// consume the stream and drop the multipart boundary). maxDuration covers the engine's
// multi-second render (longer with the optional FLUX finishing pass).
export const config = {
  api: { bodyParser: false },
  maxDuration: 60,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const SERVICE_URL = process.env.DIGITIZE_SERVICE_URL;
  const API_KEY = process.env.DIGITIZE_API_KEY;
  if (!SERVICE_URL || !API_KEY) {
    console.error('[mockup-proxy] DIGITIZE_SERVICE_URL / DIGITIZE_API_KEY not set');
    return res.status(500).json({ error: 'Mockup service is not configured.' });
  }

  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.includes('multipart/form-data')) {
    return res.status(400).json({ error: 'Expected multipart/form-data.' });
  }

  try {
    // Get the raw multipart body. With bodyParser disabled `req` is an unconsumed stream;
    // but if the platform already buffered it onto `req.body` (Vercel does this for
    // non-JSON content types), use that instead — either way we forward the exact bytes.
    let body: Buffer;
    const parsed = (req as any).body;
    if (Buffer.isBuffer(parsed)) {
      body = parsed;
    } else if (typeof parsed === 'string' && parsed.length > 0) {
      body = Buffer.from(parsed);
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of req as any) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      body = Buffer.concat(chunks);
    }

    if (body.length === 0) {
      return res.status(400).json({ error: 'Empty request body.' });
    }

    const upstream = await fetch(`${SERVICE_URL.replace(/\/$/, '')}/mockup`, {
      method: 'POST',
      headers: {
        'content-type': contentType, // preserve the exact multipart boundary
        authorization: `Bearer ${API_KEY}`,
      },
      body,
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (err: any) {
    console.error('[mockup-proxy] upstream error:', err?.message || err);
    return res.status(502).json({ error: 'Could not reach the mockup engine. Is it deployed?' });
  }
}
