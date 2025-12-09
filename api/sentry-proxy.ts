// api/sentry-proxy.ts
import { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const envelope = req.body;
    const piece = envelope.split('\n')[0];
    const header = JSON.parse(piece);
    const dsn = new URL(header.dsn);

    // You can add your own logic here to filter events
    // if you want to.
    // For example, you can deny events from certain IPs, etc.
    // if (shouldBeBlocked(req)) {
    //   return res.status(403).send('Forbidden');
    // }

    const projectId = dsn.pathname.substring(1);
    const sentryHost = dsn.hostname;

    // Use environment variables for security and flexibility
    const SENTRY_PROJECT_ID = process.env.SENTRY_PROJECT_ID;
    const SENTRY_HOST = process.env.SENTRY_HOST;

    if (!SENTRY_PROJECT_ID || !SENTRY_HOST) {
      console.error('Sentry environment variables SENTRY_PROJECT_ID and SENTRY_HOST must be set.');
      return res.status(500).send('Proxy configuration error.');
    }

    if (sentryHost !== SENTRY_HOST) {
      console.error(`Invalid Sentry host: ${sentryHost}`);
      return res.status(400).send('Invalid Sentry host.');
    }

    if (projectId !== SENTRY_PROJECT_ID) {
      console.error(`Invalid Sentry project ID: ${projectId}`);
      return res.status(400).send('Invalid Sentry project ID.');
    }

    const url = `https://${sentryHost}/api/${projectId}/envelope/`;

    const response = await fetch(url, {
      method: 'POST',
      body: envelope,
    });

    response.headers.forEach((value, key) => {
      // Sentry returns headers that we need to forward to the client.
      // For example, it can tell the client to back off if it's sending too many events.
      res.setHeader(key, value);
    });

    return res.status(response.status).send(response.body);
  } catch (e) {
    console.error('Error in Sentry proxy:', e);
    return res.status(500).send('Error proxying to Sentry');
  }
}