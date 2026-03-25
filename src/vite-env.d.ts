/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENAI_API_KEY?: string;
  readonly VITE_USE_MOCK_CLASSIFY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
