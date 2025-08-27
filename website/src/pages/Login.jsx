import React, { useEffect, useState, useMemo } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../context/AuthContext";
import { googleLogin } from "../services/UserService";
import { useNavigate } from "react-router-dom";
import ModalWrapper from "../components/ModalWrapper";
import Navbar from "../components/NavBar";
import SEO from "../components/SEO";
import { logEvent } from "../utils/analytics";

function detectEnv() {
    const ua = (navigator.userAgent || "").toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    const isStandalone =
        ("standalone" in navigator && navigator.standalone) ||
        (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);

    // iOS browser detection (all are WebKit, so rely on tokens)
    const isCriOS = /crios/.test(ua);  // Chrome on iOS
    const isFxiOS = /fxios/.test(ua);  // Firefox on iOS
    const isEdgiOS = /edgios/.test(ua); // Edge on iOS

    let browser = "generic";
    if (isIos) {
        if (isCriOS) browser = "chrome-ios";
        else if (isFxiOS) browser = "firefox-ios";
        else if (isEdgiOS) browser = "edge-ios";
        else browser = "safari-ios"; // default for iOS if none of the above
    } else {
        if (/chrome|crios|edg\//.test(ua)) browser = "chromium";
        else if (/safari/.test(ua) && !/chrome|crios|edg\//.test(ua)) browser = "safari-macos";
        else if (/firefox/.test(ua)) browser = "firefox";
        else browser = "generic";
    }

    return { isIos, isStandalone, browser };
}

export default function LoginRegister() {
    const navigate = useNavigate();
    const { setUser, setUserToken } = useAuth();

    const [error, setError] = useState("");
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [{ isIos, isStandalone, browser }, setEnv] = useState({
        isIos: false,
        isStandalone: false,
        browser: "generic",
    });

    const [modalOpen, setModalOpen] = useState(false);

    useEffect(() => {
        const handler = (e) => {
            // For Android/desktop Chromium the 'Install App' button will appear
            e.preventDefault();
            setDeferredPrompt(e);
        };
        window.addEventListener("beforeinstallprompt", handler);

        setEnv(detectEnv());

        return () => window.removeEventListener("beforeinstallprompt", handler);
    }, []);

    const showInstallTips = useMemo(() => {
        // Show tips when:
        // - iOS & not standalone (no beforeinstallprompt on iOS)
        // - OR non‑iOS & no beforeinstallprompt captured (give generic tips)
        if (isIos && !isStandalone) return true;
        if (!isIos && !deferredPrompt) return true;
        return false;
    }, [isIos, isStandalone, deferredPrompt]);

    const handleInstallClick = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            setDeferredPrompt(null);
        }
    };

    const handleGoogleSuccess = async (credentialResponse) => {
        const result = await googleLogin(credentialResponse.credential);
        if (result?.error) {
            setError(result.error);
            return;
        }
        if (result?.newUser)
            logEvent("sign_up", { method: "google" });
        else
            logEvent("login", { method: "google" });
        setUser(result.user);
        setUserToken(result.userToken);
        navigate("/dashboard");
    };

    const TitleByBrowser = {
        "chrome-ios": "Add to Home Screen — Chrome (iPhone/iPad)",
        "safari-ios": "Add to Home Screen — Safari (iPhone/iPad)",
        "firefox-ios": "Add to Home Screen — Firefox (iPhone/iPad)",
        "edge-ios": "Add to Home Screen — Edge (iPhone/iPad)",
        chromium: "Install App — Chrome/Edge",
        "safari-macos": "Install App — Safari (macOS)",
        firefox: "Install App — Firefox",
        generic: "Install App — Your Browser",
    };

    const BodyByBrowser = {
        "chrome-ios": (
            <>
                <p className="text-sm text-gray-300 mb-4">
                    Open this site in Chrome on your iPhone/iPad.
                    Tap the <strong>Share</strong> icon next to the address bar, then choose <strong>“Add to Home Screen”</strong>.
                </p>
                <img src="/private/chrome.jpeg" alt="Chrome iOS Share" className="rounded-lg border border-white/10" />
                <ol className="list-decimal ml-5 mt-3 text-sm text-gray-300 space-y-1">
                    <li>Tap <strong>Share</strong>.</li>
                    <li>Select <strong>Add to Home Screen</strong>.</li>
                    <li>Confirm the name and tap <strong>Add</strong>.</li>
                </ol>
            </>
        ),
        "safari-ios": (
            <>
                <p className="text-sm text-gray-300 mb-4">
                    Open this site in Safari. Tap the <strong>Share</strong> button in the bottom toolbar, then choose <strong>“Add to Home Screen”</strong>.
                </p>
                <img src="/private/ios.jpeg" alt="Safari iOS Share" className="rounded-lg border border-white/10" />
                <ol className="list-decimal ml-5 mt-3 text-sm text-gray-300 space-y-1">
                    <li>Tap <strong>Share</strong>.</li>
                    <li>Scroll if needed and tap <strong>Add to Home Screen</strong>.</li>
                    <li>Tap <strong>Add</strong>.</li>
                </ol>
            </>
        ),
        "firefox-ios": (
            <>
                <p className="text-sm text-gray-300 mb-4">
                    In Firefox on iOS, tap the <strong>Share</strong> icon, then select <strong>“Add to Home Screen”</strong>.
                </p>
                <ol className="list-decimal ml-5 mt-3 text-sm text-gray-300 space-y-1">
                    <li>Tap <strong>Share</strong>.</li>
                    <li>Choose <strong>Add to Home Screen</strong>.</li>
                    <li>Tap <strong>Add</strong>.</li>
                </ol>
            </>
        ),
        "edge-ios": (
            <>
                <p className="text-sm text-gray-300 mb-4">
                    In Edge on iOS, tap the <strong>Share</strong> icon, then select <strong>“Add to Home Screen”</strong>.
                </p>
                <ol className="list-decimal ml-5 mt-3 text-sm text-gray-300 space-y-1">
                    <li>Tap <strong>Share</strong>.</li>
                    <li>Choose <strong>Add to Home Screen</strong>.</li>
                    <li>Tap <strong>Add</strong>.</li>
                </ol>
            </>
        ),
        chromium: (
            <>
                <p className="text-sm text-gray-300">
                    If you don’t see an <strong>Install</strong> prompt, open the browser menu
                    and choose <strong>Install App</strong> / <strong>Add to Home Screen</strong>.
                </p>
            </>
        ),
        "safari-macos": (
            <>
                <p className="text-sm text-gray-300">
                    In Safari (macOS), go to <strong>File → Add to Dock…</strong> to install the app-like shortcut.
                </p>
            </>
        ),
        firefox: (
            <>
                <p className="text-sm text-gray-300">
                    In Firefox, open the browser menu and look for <strong>Install</strong> / <strong>Use as App</strong> or add a shortcut to your home screen.
                </p>
            </>
        ),
        generic: (
            <>
                <p className="text-sm text-gray-300">
                    Open your browser menu and look for <strong>Install App</strong>, <strong>Add to Home Screen</strong>, or <strong>Add to Dock</strong>.
                </p>
            </>
        ),
    };

    return (
        <div className="h-[100dvh] w-full flex items-center justify-center bg-[#121212] text-[#EBF1D5]">
            <SEO
                title="Login | Expensease"
                description="Login to Expensease to track shared expenses, manage friends, and simplify settlements."
                canonical="https://www.expensease.in/login"
                schema={{
                    "@context": "https://schema.org",
                    "@type": "WebPage",
                    "name": "Login - Expensease",
                    "description": "Login to Expensease to track shared expenses, manage friends, and simplify settlements.",
                    "url": "https://www.expensease.in/login"
                }}
            />

            <Navbar />
            <div className="w-full max-w-md p-8 space-y-6">
                <h2 className="text-3xl font-bold text-center">Expensease Login</h2>


                <div className="flex justify-center">
                    <GoogleLogin
                        onSuccess={handleGoogleSuccess}
                        onError={() => setError("Google login failed.")}
                        theme="filled_black"
                        size="large"
                    />
                </div>

                {error && <p className="text-red-400 text-center">{error}</p>}

                {showInstallTips && (
                    <div className="text-center mt-2">
                        <p className="text-sm text-gray-300">
                            🚀 <strong>Install as an app for a better experience.</strong>
                        </p>

                        {isIos ? (
                            <p className="text-sm text-gray-300 mt-1">
                                On iPhone/iPad, use{" "}
                                {browser === "chrome-ios" ? "Chrome" :
                                    browser === "safari-ios" ? "Safari" :
                                        browser === "firefox-ios" ? "Firefox" :
                                            browser === "edge-ios" ? "Edge" : "your browser"}{" "}
                                to <strong>Add to Home Screen</strong>.
                            </p>
                        ) : (
                            <p className="text-sm text-gray-300 mt-1">
                                On this browser, open the menu and choose <strong>Install App</strong> /{" "}
                                <strong>Add to Home Screen</strong>.
                            </p>
                        )}

                        <button
                            onClick={() => {
                                logEvent('install_instructions_viewed', {
                                    screen: 'login',
                                    browser: browser,
                                    os: isIos ? 'ios' : 'other',
                                })
                                setModalOpen(true)
                            }}
                            className="text-sm px-3 py-2 bg-white/10 hover:bg-white/20 rounded-md mt-3"
                            aria-label="View installation instructions"
                        >
                            View instructions
                        </button>
                    </div>
                )}

                {deferredPrompt && (
                    <div className="flex flex-col text-center mt-2 gap-2">
                        <p className="text-sm text-gray-300">
                            🚀 <strong>Install as an app for a better experience.</strong>
                        </p>
                        <button
                            onClick={handleInstallClick}
                            className="w-full py-2 bg-teal-500 text-white rounded-md hover:bg-teal-600 mb-4"
                        >
                            📥 Install
                        </button>
                    </div>
                )}


                <ModalWrapper
                    show={modalOpen}
                    onClose={() => setModalOpen(false)}
                    title={TitleByBrowser[browser] || TitleByBrowser.generic}
                    size="lg"
                    footer={
                        <button
                            onClick={() => setModalOpen(false)}
                            className="px-4 py-2 text-sm bg-white/6 rounded-md hover:bg-white/8"
                        >
                            Got it
                        </button>
                    }
                >
                    {BodyByBrowser[browser] || BodyByBrowser.generic}
                </ModalWrapper>
            </div>
        </div>
    );
}
