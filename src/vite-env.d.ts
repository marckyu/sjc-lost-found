/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_PB_URL?: string;
    readonly VITE_MATCHER_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}