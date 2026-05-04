// Standalone Tawk.to widget — usable on any page (auth or pre-auth).
// Pre-fills visitor context if name/email are passed; otherwise visitor types in widget.
import React from 'react';

const TAWK_PROPERTY_ID =
  (import.meta as any).env?.VITE_TAWK_PROPERTY_ID || '64b56d7d94cf5d49dc6422c0';
const TAWK_WIDGET_ID =
  (import.meta as any).env?.VITE_TAWK_WIDGET_ID || '1h5ib7cm1';

interface Props {
  name?: string;
  email?: string;
}

const TawkToWidget: React.FC<Props> = ({ name, email }) => {
  React.useEffect(() => {
    // Tawk.to expects globals before script loads
    (window as any).Tawk_API = (window as any).Tawk_API || {};
    (window as any).Tawk_LoadStart = new Date();

    if (name || email) {
      (window as any).Tawk_API.onLoad = function () {
        (window as any).Tawk_API.setAttributes(
          {
            name: name || 'Customer',
            email: email || '',
          },
          function (err: any) {
            if (err) console.warn('[Tawk] setAttributes error', err);
          }
        );
      };
    }

    // Don't double-load if widget script is already on page (e.g. user navigates between layouts)
    if (document.getElementById('tawk-script')) return;

    const script = document.createElement('script');
    script.id = 'tawk-script';
    script.async = true;
    script.src = `https://embed.tawk.to/${TAWK_PROPERTY_ID}/${TAWK_WIDGET_ID}`;
    script.charset = 'UTF-8';
    script.setAttribute('crossorigin', '*');
    document.body.appendChild(script);
    // Don't remove on unmount — we want chat persistence across page nav
  }, [name, email]);

  return null;
};

export default TawkToWidget;
