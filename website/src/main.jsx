import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { GoogleOAuthProvider } from '@react-oauth/google';
import { HeadProvider } from 'react-head';

import './index.css';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import RouteTracker from "./context/RouteTracker.jsx";
import { registerSW } from 'virtual:pwa-register';
import { initAnalytics } from './utils/analytics.js';

initAnalytics();

const root = document.getElementById("root");

const updateSW = registerSW({
    onNeedRefresh() {
        if (confirm("New version available. Reload now?")) {
            updateSW(true);
        }
    },
});

ReactDOM.createRoot(root).render(
    <React.StrictMode>
        <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
            <BrowserRouter>
                <HeadProvider>
                    {/* ✅ Global SoftwareApplication Schema */}
                    <script type="application/ld+json">
                        {JSON.stringify({
                            "@context": "https://schema.org",
                            "@type": "SoftwareApplication",
                            "name": "Expensease",
                            "applicationCategory": "FinanceApplication",
                            "operatingSystem": "iOS, Android, Web",
                            "description":
                                "Expensease makes managing money simple by helping you split expenses fairly, track personal and group spending, and settle up with friends effortlessly. Perfect for roommates, trips, and everyday budgeting.",
                            "url": "https://www.expensease.in",
                            "offers": {
                                "@type": "Offer",
                                "price": "0",
                                "priceCurrency": "INR",
                            },
                            "author": {
                                "@type": "Organization",
                                "name": "Expensease",
                            },
                            "publisher": {
                                "@type": "Organization",
                                "name": "Expensease",
                            },
                        })}
                    </script>

                    <AuthProvider>
                        <RouteTracker />
                        <App />
                    </AuthProvider>
                </HeadProvider>

            </BrowserRouter>
        </GoogleOAuthProvider>
    </React.StrictMode>
);
