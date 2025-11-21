/// <reference types="vite/client" />
/// <reference types="vitest/globals" />

// This triple-slash directive loads Vite's client types, which includes the definition for `import.meta.env`.

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_SUPABASE_SERVICE_ROLE_KEY: string; // This should NOT be exposed to the client.
  readonly VITE_CRM_BASE_URL?: string; // Keep if used for CRM base URL
  readonly VITE_SENDGRID_API_KEY?: string;
  readonly VITE_TWILIO_ACCOUNT_SID?: string;
  readonly VITE_TWILIO_AUTH_TOKEN?: string;
  readonly VITE_TWILIO_PHONE_NUMBER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}