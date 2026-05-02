// HostnameRouter.tsx
// Routes traffic based on hostname:
//   - portal.pandapatches.com (or whatever PORTAL_HOSTNAME is set to)
//       → only customer portal routes are valid; everything else redirects to /customer/login
//   - any other hostname (CRM URL, localhost)
//       → both CRM and customer portal routes are available
//
// When the CEO sets up the real subdomain, just update PORTAL_HOSTNAME in src/config/portal.ts
// and Vercel domain mapping — no other code changes needed.

import * as React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isPortalHost, isLocalhost } from './config/portal';

interface Props {
  children: React.ReactNode;
}

export const HostnameRouter: React.FC<Props> = ({ children }) => {
  const location = useLocation();
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

  const onPortalHost = isPortalHost(hostname);
  const onLocalDev   = isLocalhost(hostname);

  // On the portal subdomain, force ALL traffic to /customer/* routes
  if (onPortalHost && !location.pathname.startsWith('/customer')) {
    return <Navigate to="/customer/login" replace />;
  }

  // On CRM hostname, prevent /customer/* routes from rendering (push them away)
  // EXCEPT during local dev where both should be accessible
  if (!onPortalHost && !onLocalDev && location.pathname.startsWith('/customer')) {
    // In production: customer trying to use CRM domain — let them through
    // because we can't 100% distinguish "shared a customer URL" from "wrong host"
    // The CustomerProtectedRoute handles staff-bouncing logic.
    // This is a soft guard: customer routes work on either hostname for now.
  }

  return <>{children}</>;
};

export default HostnameRouter;
