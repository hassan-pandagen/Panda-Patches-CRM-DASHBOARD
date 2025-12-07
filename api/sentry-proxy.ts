import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract the original Sentry ingest URL from environment
    const sentryIngestUrl = 'https://1d30e386f4968460dc23045cb808978d@o4510487337762816.ingest.us.sentry.io/4510487352639488';

    console.log('[Sentry Proxy] Forwarding error event to Sentry');
    console.log('[Sentry Proxy] Body preview:', JSON.stringify(req.body).substring(0, 200));

    // Forward the request to Sentry with proper headers
    const response = await fetch(sentryIngestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': req.headers['user-agent'] || 'Sentry Client',
      },
      body: JSON.stringify(req.body),
    });

    console.log('[Sentry Proxy] Sentry response status:', response.status);

    // Return success response to client (always 200 to prevent client retries)
    res.status(200).json({ 
      success: response.ok,
      sentryStatus: response.status
    });
  } catch (error) {
    console.error('[Sentry Proxy] Error forwarding to Sentry:', error);
    // Still return 200 so client doesn't retry
    res.status(200).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Proxy error' 
    });
  }
}
