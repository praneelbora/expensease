// vite.config.js
import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import svgr from "vite-plugin-svgr";
import { defineConfig } from "vite";

export default defineConfig({
    server: {
        host: "0.0.0.0",
        port: 5173,
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
            registerType: "autoUpdate",

            // IMPORTANT: disable PWA behaviour in dev environment
            devOptions: {
                enabled: false, // <- prevents service worker registration when running `vite`
            },

            // Workbox options forwarded to generateSW; add runtime caching rules here
            workbox: {
                cleanupOutdatedCaches: true,

                // allow precache matching to ignore query params (fixes ?import&react issues)
                // NOTE: this will ignore all URL search params for precache matching — use with care
                ignoreURLParametersMatching: [/.*/],

                // runtimeCaching rules for external/dynamic endpoints
                runtimeCaching: [
                    {
                        // API calls -> NetworkFirst (fresh when online, cached fallback when offline)
                        urlPattern: ({ url }) =>
                            url.pathname.startsWith('/api/') || url.origin.includes('localhost') && url.pathname.startsWith('/api/'),
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'api-cache-v1',
                            networkTimeoutSeconds: 3,
                            expiration: {
                                maxEntries: 100,
                                maxAgeSeconds: 5 * 60,
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            }
                        }
                    },
                    {
                        // Google Analytics (let it go to network but don't spam no-route logs)
                        urlPattern: /^https:\/\/www\.google-analytics\.com\/.*$/i,
                        handler: 'NetworkOnly'
                    },
                    {
                        // SVGs & images -> StaleWhileRevalidate
                        urlPattern: ({ request, url }) =>
                            request.destination === 'image' || url.pathname.endsWith('.svg') || url.pathname.endsWith('.png'),
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'static-resources',
                            expiration: {
                                maxEntries: 200,
                                maxAgeSeconds: 7 * 24 * 60 * 60
                            }
                        }
                    }
                ]
            },

            includeAssets: [
                "favicon.ico",
                "apple-touch-icon.png",
                "robots.txt",
                "icons/image192.png",
                "icons/image512.png",
            ],
            manifest: {
                name: "Expensease",
                short_name: "Expensease",
                description:
                    "Expensease is a comprehensive expense management app that helps users effortlessly split expenses with friends and groups, track loans among contacts, and monitor personal spending through categorized expenses.",
                theme_color: "#1f1f1f",
                background_color: "#1f1f1f",
                display: "standalone",
                start_url: "/",
                icons: [
                    {
                        src: "/icons/image192.png",
                        sizes: "192x192",
                        type: "image/png",
                    },
                    {
                        src: "/icons/image512.png",
                        sizes: "512x512",
                        type: "image/png",
                    },
                    {
                        src: "/icons/image512.png",
                        sizes: "512x512",
                        type: "image/png",
                        purpose: "any maskable",
                    },
                ],
            },
        }),
    ],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
});
