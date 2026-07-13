/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AURAONE_OFFICIAL_STYLE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
