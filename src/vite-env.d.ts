/// <reference types="vite/client" />
/// <reference types="vitest/globals" />

// This triple-slash directive loads Vite's client types, which includes the definition for `import.meta.env`.

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}