import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    root: '.',
    publicDir: 'public',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: false,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                admin: resolve(__dirname, 'admin.html'),
                items: resolve(__dirname, 'items.html'),
                messages: resolve(__dirname, 'messages.html'),
                notifications: resolve(__dirname, 'notifications.html'),
                report: resolve(__dirname, 'report.html')
            }
        }
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