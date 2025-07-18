import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';

import { registerSW } from 'virtual:pwa-register' // ✅ PWA support

// Optional: automatically reload when there's an update
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm("New version available. Reload now?")) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log("App ready for offline use.");
  },
});

const root = document.getElementById("root");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
