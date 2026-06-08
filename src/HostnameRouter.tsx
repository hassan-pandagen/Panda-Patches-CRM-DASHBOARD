// HostnameRouter.tsx
// The customer login portal has moved to the marketing website. This app now only serves:
//   - the staff CRM (Orders, Dashboard, etc.)
//   - the public agent-generated payment form at /pay/:token
//
// There is no longer any hostname-based redirect to do — every remaining route is valid on
// any host, and unknown paths fall through to the 404. Kept as a thin pass-through so the
// existing <HostnameRouter> usage in App.tsx doesn't need to change, and so reinstating
// host-specific behavior later is a one-file edit.

import * as React from 'react';

interface Props {
  children: React.ReactNode;
}

export const HostnameRouter: React.FC<Props> = ({ children }) => {
  return <>{children}</>;
};

export default HostnameRouter;
