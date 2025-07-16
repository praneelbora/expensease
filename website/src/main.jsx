import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom"; // ✅ use react-router-dom, not "react-router"
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx'; // ✅ import your AuthProvider

const root = document.getElementById("root");

ReactDOM.createRoot(root).render(
    <React.StrictMode>
        <BrowserRouter>
            <AuthProvider>         {/* ✅ Wrap your app with the AuthProvider */}
                <App />
            </AuthProvider>
        </BrowserRouter>
    </React.StrictMode>
);
