// src/pages/LoginRegister.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { useNavigate } from "react-router-dom";
import { LogIn, CheckCircle, AlertTriangle, Info } from "lucide-react";
import NavBar from "../components/NavBar";
import SEO from "../components/SEO";
import ModalWrapper from "../components/ModalWrapper";
import { useAuth } from "../context/AuthContext";
import { googleLogin } from "../services/UserService";
import { logEvent } from "../utils/analytics";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
function createISTDate(year, month, day, hours = 0, minutes = 0, seconds = 0) {
  // JS Date.UTC is in UTC → shift IST (UTC+5:30) back
  const utcTime = Date.UTC(year, month - 1, day, hours - 5, minutes - 30, seconds);
  return new Date(utcTime);
}
// Example: 27 Aug 2025, 10:00:00 IST
const buildDate = createISTDate(2025, 8, 27, 14, 30, 0);

/**
 * LoginRegister — single Google auth flow
 * - Custom-styled Google button (matches dark theme / teal accents)
 * - Better UX: focused copy, loading & error states, tips, PWA install modal (text-only)
 * - Accessibility: aria labels, keyboard focus, semantic html
 *
 * Notes:
 * - Backend `googleLogin(token)` should accept either an ID token (credential)
 *   or an access token (we attempt to pass whichever Google returns).
 * - This file intentionally has no images and keeps your color theme.
 */

function detectEnv() {
  const ua = (navigator.userAgent || "").toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua);
  const isStandalone =
    ("standalone" in navigator && window.standalone) ||
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);

  const isCriOS = /crios/.test(ua);
  const isFxiOS = /fxios/.test(ua);
  const isEdgiOS = /edgios/.test(ua);

  let browser = "generic";
  if (isIos) {
    if (isCriOS) browser = "chrome-ios";
    else if (isFxiOS) browser = "firefox-ios";
    else if (isEdgiOS) browser = "edge-ios";
    else browser = "safari-ios";
  } else {
    if (/chrome|crios|edg\//.test(ua)) browser = "chromium";
    else if (/safari/.test(ua) && !/chrome|crios|edg\//.test(ua)) browser = "safari-macos";
    else if (/firefox/.test(ua)) browser = "firefox";
  }

  return { isIos, isStandalone, browser };
}

export default function LoginRegister() {
  const navigate = useNavigate();
  const { setUser, setUserToken } = useAuth();

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);

  // PWA install flow
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  // env
  const [env] = useState(detectEnv());
  const { isIos, isStandalone, browser } = env;

  // capture beforeinstallprompt
  useEffect(() => {
    function handler(e) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // auto-clear minor errors after a bit
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(""), 8000);
    return () => clearTimeout(id);
  }, [error]);

  // Derived - when to show install tips
  const showInstallTips = useMemo(() => {
    if (isIos && !isStandalone) return true;
    if (!isIos && !deferredPrompt) return true;
    return false;
  }, [isIos, isStandalone, deferredPrompt]);

  // Analytics hook (clicks)
  const recordClick = (name, props = {}) => {
    try {
      logEvent(name, props);
    } catch {
      // swallow analytics failures
    }
  };

  // Shared handler: try both id_token-like credential and access_token
  async function handleBackendAuth(tokenOrObject) {
    // tokenOrObject may be: { credential } or { access_token } or string
    try {
      let tokenToSend = "";
      if (!tokenOrObject) throw new Error("Missing credentials from Google flow.");

      if (typeof tokenOrObject === "string") tokenToSend = tokenOrObject;
      else if (tokenOrObject.credential) tokenToSend = tokenOrObject.credential;
      else if (tokenOrObject.access_token) tokenToSend = tokenOrObject.access_token;
      else if (tokenOrObject.code) tokenToSend = tokenOrObject.code;
      else tokenToSend = JSON.stringify(tokenOrObject);

      const result = await googleLogin(tokenToSend);
      if (!result) throw new Error("No response from server. Try again.");
      if (result.error) throw new Error(result.error);

      // success
      setUser(result.user);
      setUserToken(result.userToken);

      // analytics: sign_up vs login
      try {
        if (result.newUser) {
          logEvent("sign_up", { method: "google" });
        } else {
          logEvent("login", { method: "google" });
        }
      } catch { }

      // navigate with slight delay for smoother transition
      setTimeout(() => navigate("/dashboard"), 220);
    } catch (e) {
      throw e;
    }
  }
  const onGoogleSuccess = async (codeResponse) => {
    setError("");
    setLoading(true); // start spinner

    try {
      if (!codeResponse.access_token) {
        setError("Google login did not return an access token");
        return;
      }

      const result = await googleLogin(codeResponse.access_token);
      if (result?.error) {
        setError(result.error);
        return;
      }

      if (result?.newUser) logEvent("sign_up", { method: "google" });
      else logEvent("login", { method: "google" });

      setUser(result.user);
      setUserToken(result.userToken);

      navigate("/dashboard");
    } catch (err) {
      console.error(err);
      setError("Google login failed. Try again.");
    } finally {
      setLoading(false); // stop spinner
    }
  };

  const onGoogleError = () => {
    setError("Google sign-in was cancelled or blocked. Try again or check your browser settings.");
    recordClick("auth_google_popup_failed", { screen: "login" });
  };

  // useGoogleLogin gives us a function to trigger Google's popup using our handlers
  const login = useGoogleLogin({
    onSuccess: onGoogleSuccess,
  });

  // Install flow for Chromium browsers
  const handleInstall = async () => {
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      recordClick("pwa_install_choice", { outcome: choice?.outcome || "unknown" });
      setDeferredPrompt(null);
    } catch (e) {
      // ignore
    }
  };

  // Install modal content (text-only)
  const installTitle = {
    "chrome-ios": "Add to Home Screen — Chrome (iOS)",
    "safari-ios": "Add to Home Screen — Safari (iOS)",
    "firefox-ios": "Add to Home Screen — Firefox (iOS)",
    "edge-ios": "Add to Home Screen — Edge (iOS)",
    chromium: "Install Expensease — Chrome/Edge",
    "safari-macos": "Add to Dock — Safari (macOS)",
    firefox: "Install — Firefox",
    generic: "Install Expensease",
  }[browser || "generic"];

  const installBody = {
    "chrome-ios": "Open this site in Chrome on your iPhone/iPad → tap Share → Add to Home Screen.",
    "safari-ios": "Open this site in Safari → tap Share → Add to Home Screen → confirm.",
    "firefox-ios": "Open this site in Firefox → tap Share → Add to Home Screen (if available).",
    "edge-ios": "Open this site in Edge → tap Share → Add to Home Screen (if available).",
    chromium: "Your browser supports installing web apps. If you don't see a prompt, open the browser menu and choose Install App / Add to Home Screen.",
    "safari-macos": "In Safari (macOS) use File → Add to Dock… or use the Share menu to create an app-like shortcut.",
    firefox: "Firefox may offer an Install option in the menu. If not, pin the page or create a browser shortcut.",
    generic: "Open your browser menu and choose Add to Home Screen or Install App to create a quick shortcut.",
  }[browser || "generic"];

  // Small helper to show a friendly timestamp (when site last updated or similar; optional)
  const lastUpdatedText = useMemo(() => {
    try {
      return formatDistanceToNowStrict(buildDate, { addSuffix: true });
    } catch {
      return "";
    }
  }, []);

  return (
    <div className="w-full bg-[#121212] text-[#EBF1D5]">
      <SEO
        title="Login | Expensease"
        description="Sign in with Google to start using Expensease — split bills, track group expenses, and settle easily."
        canonical="https://www.expensease.in/login"
        schema={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Login - Expensease",
          description: "Login or sign up with Google to start using Expensease.",
          url: "https://www.expensease.in/login",
        }}
      />

      <NavBar />

      <main className="flex min-h-[calc(100vh-72px)] items-center justify-center px-4 py-6 md:py-12 mt-16">
        <div className="w-full lg:max-w-[80%] grid gap-x-8 gap-y-4 md:grid-cols-2 items-center">
          {/* Left: Product pitch (concise) */}
          <section className="rounded-2xl p-8 bg-[#0f0f0f] border border-[#1a1a1a] shadow-sm">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="text-3xl md:text-5xl text-white font-semibold">Expensease</h2>
                <div className="text-xs text-[#888] mt-1">Simple, honest expense splitting for friends, roommates, and trips.</div>
              </div>
            </div>

            <div className="mt-5 space-y-3 text-sm text-[#ededed]">
              <p>Sign in with Google - <u>one click</u> to create your account and start splitting.</p>

              <ul className="list-disc ml-5 space-y-1">
                <li>Track personal expenses to stay on top of your budget.</li>
                <li>Create groups and share expenses with friends.</li>
                <li>Track who paid, who owes, and settle balances quickly.</li>
                <li>Privacy-first: groups are private by default.</li>
              </ul>

              <div className="mt-3 text-xs text-[#888]">
                <div>Last updated: {lastUpdatedText}</div>
              </div>
            </div>

            <div className="hidden md:block mt-6 border-t border-[#161616] pt-4 text-xs text-[#ededed]">
              <div className="flex items-center gap-2">
                <CheckCircle size={14} className="text-teal-400" />
                <span>Only Google sign-in is supported right now</span>
              </div>
              <div className="mt-2">
                <button
                  onClick={() => { setHelpOpen(true); recordClick("login_help_opened"); }}
                  className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-md border border-white/6 [#aaa] hover:bg-white/3"
                >
                  <Info size={14} /> Sign-in help
                </button>
              </div>
            </div>
          </section>

          {/* Right: Auth card */}
          <section className="rounded-2xl p-6 bg-[#0f0f0f] border border-[#1a1a1a] shadow-lg">
            <div className="text-center">
              <h3 className="text-2xl font-semibold text-white">Login to Expensease</h3>
            </div>

            <div className="mt-6">
              {/* Custom Google button */}
              <button
                onClick={() => {
                  setError("");
                  recordClick("auth_google_clicked", { screen: "login" });
                  try {
                    login(); // triggers Google popup
                  } catch (e) {
                    // fallback - show user-friendly error
                    setError("Unable to open sign-in window. Try a different browser or disable extensions.");
                    recordClick("auth_google_invoke_failed", { message: String(e) });
                  }
                }}
                disabled={loading}
                aria-label="Sign in with Google"
                className={`w-full inline-flex items-center justify-center gap-3 py-3 rounded-xl font-semibold transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${loading ? "opacity-80 cursor-wait transform-none" : "hover:-translate-y-0.5 active:translate-y-0"
                  }`}
                style={{
                  background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-teal-400" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" fill="none" />
                    </svg>
                    <span className="text-teal-300">Signing in…</span>
                  </>
                ) : (
                  <>
                    <svg width="20px" height="20px" viewBox="-3 0 262 262" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid"><path d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622 38.755 30.023 2.685.268c24.659-22.774 38.875-56.282 38.875-96.027" fill="#4285F4" /><path d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055-34.523 0-63.824-22.773-74.269-54.25l-1.531.13-40.298 31.187-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1" fill="#34A853" /><path d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82 0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602l42.356-32.782" fill="#FBBC05" /><path d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0 79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251" fill="#EB4335" /></svg>
                    <span className="text-sm text-[#fff]">Continue with Google</span>
                  </>
                )}
              </button>

              {/* small note */}
              <div className="mt-4 text-center text-xs text-[#888]">
                By continuing you agree to our <a href="/terms" className="underline text-teal-400">Terms</a> and <a href="/privacy" className="underline text-teal-400">Privacy Policy</a>.
              </div>

              {/* error / help */}
              {error && <div className="mt-4 min-h-[40px] flex items-center justify-center">
                  <div className="flex items-center gap-2 text-sm text-rose-400">
                    <AlertTriangle size={16} /> {error}
                  </div>
              </div>}


              {/* install / help row */}
              <div className="mt-6 flex items-center justify-between gap-3">
                {deferredPrompt ? (
                  <button
                    onClick={() => { handleInstall(); recordClick('install_clicked'); }}
                    className="px-3 py-2 rounded-md bg-teal-600 text-black font-semibold hover:bg-teal-700"
                  >
                    Install app
                  </button>
                ) : showInstallTips ? (
                  <button
                    onClick={() => { setHelpOpen(true); recordClick('install_tips_opened'); }}
                    className="px-3 py-2 rounded-md border border-white/8 text-[#ededed] hover:bg-white/3"
                  >
                    Installation & Tips
                  </button>
                ) : (
                  <div />
                )}

                <a href="/contact" className="text-xs text-teal-400 hover:underline">Need help?</a>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Help / Install modal (text only) */}
      <ModalWrapper
        show={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Sign-in & Installation guide"
        size="md"
        footer={
          <div className="flex justify-end">
            <button onClick={() => setHelpOpen(false)} className="px-4 py-2 rounded-md bg-white/6 hover:bg-white/8">Close</button>
          </div>
        }
      >
        <div className="space-y-4 text-sm text-[#ededed]">
          <section>
            <h2 className="font-semibold text-xl mb-2">Signing in with Google</h2>
            <p>We only request your name and email from Google to create a profile. If sign-in fails:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Allow pop-ups for this site — Google opens a small sign-in window.</li>
              <li>Try a different browser (Chrome/Edge/Firefox/Safari) if the popup is blocked.</li>
              <li>Prefer a private window? It can help if extensions interfere.</li>
            </ul>
          </section>
        <hr />
          <section>
            <h2 className="font-semibold text-xl mb-2">Install as an app</h2>
            <p>{installBody}</p>
            <ol className="list-decimal ml-5 mt-2 space-y-1 text-[#aaa]">
              <li>Open this site in your browser (Safari / Chrome / Edge).</li>
              <li>Open the browser menu (or Share menu on mobile).</li>
              <li>Choose <strong>Add to Home Screen</strong> or <strong>Install</strong> and confirm.</li>
            </ol>
          </section>
        <hr />
          <section>
            <h2 className="font-semibold text-xl mb-2">Still stuck?</h2>
            <p><a href="/contact" className="underline text-teal-400">Contact us</a> and include the browser name and a short description of the problem.</p>
          </section>
        </div>
      </ModalWrapper>
    </div>
  );
}
