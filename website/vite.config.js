import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa';
import svgr from "vite-plugin-svgr";

export default defineConfig({
    server: {
        host: '0.0.0.0',
        port: 5173
    },
    plugins: [
        react(),
        tailwindcss(),
        svgr({
            svgrOptions: {
                icon: true,
            },
        }),
        VitePWA({
            registerType: 'autoUpdate',
            workbox: {
                cleanupOutdatedCaches: true,
            },
            includeAssets: [
                'favicon.ico',
                'apple-touch-icon.png',
                'robots.txt',
                'icons/image192.png',
                'icons/image512.png',
            ],
            manifest: {
                name: 'Expensease',
                short_name: 'Expensease',
                description:
                    'Expensease is a comprehensive expense management app that helps users effortlessly split expenses with friends and groups, track loans among contacts, and monitor personal spending through categorized expenses.',
                theme_color: '#1f1f1f',
                background_color: '#1f1f1f',
                display: 'standalone',
                start_url: '/',
                icons: [
                    {
                        src: '/icons/image192.png',
                        sizes: '192x192',
                        type: 'image/png',
                    },
                    {
                        src: '/icons/image512.png',
                        sizes: '512x512',
                        type: 'image/png',
                    },
                    {
                        src: '/icons/image512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable',
                    },
                ],
            },
        })


    ],
})
