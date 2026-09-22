import { defineConfig } from 'vite';

export default defineConfig({
    root: '.',
    publicDir: 'public',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: false
    },
    server: {
        port: 5173,
        open: true,
        host: true
    },
    preview: {
        port: 4173,
        open: true
    }
});