import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract the original Sentry ingest URL from environment
    const sentryIngestUrl = 'https://1d30e386f4968460dc23045cb808978d@o4510487337762816.ingest.us.sentry.io/4510487352639488';

    // Forward the request to Sentry
    const response = await fetch(sentryIngestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    // Return success response to client
    res.status(response.status).json({ success: true });
  } catch (error) {
    console.error('Sentry proxy error:', error);
    // Still return 200 so client doesn't retry
    res.status(200).json({ success: false, error: 'Proxy error' });
  }
}
