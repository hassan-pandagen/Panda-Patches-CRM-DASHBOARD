// Portal hostname configuration
// CHANGE THIS ONE LINE when the CEO sets up the actual customer portal subdomain.
// Everything else in the app reads from this constant.

export const PORTAL_HOSTNAME = 'login.pandapatches.com';

// CRM hostname is whatever the current Vercel deployment uses.
// localhost is treated as "both" — useful for development.
export const isPortalHost = (hostname: string): boolean => {
  if (hostname === PORTAL_HOSTNAME) return true;
  return false;
};

export const isLocalhost = (hostname: string): boolean => {
  return hostname === 'localhost' || hostname === '127.0.0.1';
};

// Use this when constructing portal URLs (invites, redirects, emails, etc.)
// Returns the appropriate origin based on environment.
export const getPortalOrigin = (): string => {
  if (typeof window === 'undefined') return `https://${PORTAL_HOSTNAME}`;
  const { hostname, protocol, port } = window.location;
  if (isLocalhost(hostname)) {
    return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
  }
  return `https://${PORTAL_HOSTNAME}`;
};
