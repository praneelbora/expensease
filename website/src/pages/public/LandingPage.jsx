import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Cookies from "js-cookie";
import SEO from "../../components/SEO";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import { CheckCircle, PieChart, CreditCard, Clock, Users } from "lucide-react";
import { motion } from "framer-motion";

// Use the real App Store link you gave
const APP_STORE_URL = "https://apps.apple.com/in/app/expensease/id6752623771";
// Website fallback for Android users (or to redirect them to web flows)
const WEBSITE_URL = "https://www.expensease.in/";

const FEATURES = [
  /* ...same as before... */
];

const STEPS = [
  /* ...same as before... */
];

const testimonials = [
  /* ...same as before... */
];

const fadeUp = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } };

function StoreBadge({ href, label, children }) {
  return (
    <a
      href={href}
      rel="noopener noreferrer"
      target="_blank"
      className="inline-flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 hover:shadow hover:scale-[1.01] transition"
      aria-label={label}
    >
      {children}
    </a>
  );
}

/**
 * Simple UA-based OS detection.
 * NOTE: UA sniffing is imperfect but OK for hero-button/landing tweaks.
 */
function detectOS(ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "") {
  const userAgent = ua.toLowerCase();

  // iPadOS (desktop UA) detection fallback:
  // On iPadOS 13+ Safari reports Mac-like platform; use maxTouchPoints check in component.
  if (/iphone/.test(userAgent) || /ipod/.test(userAgent)) return "ios";
  if (/ipad/.test(userAgent)) return "ios";
  if (/android/.test(userAgent)) return "android";
  return "other";
}

export default function LandingPage() {
  const userToken = Cookies.get("userToken");
  const [os, setOs] = useState("other");

  useEffect(() => {
    // First pass UA detection
    let detected = detectOS();

    // Extra check for iPadOS (Safari on iPad uses Mac-like UA). Check navigator.platform / maxTouchPoints:
    try {
      // eslint-disable-next-line no-undef
      const isTouchDevice = navigator?.maxTouchPoints && navigator.maxTouchPoints > 1;
      const platform = navigator?.platform || "";
      if (platform?.toLowerCase().includes("mac") && isTouchDevice) {
        // iPadOS often reports Mac platform with touch support: treat as iOS
        detected = "ios";
      }
    } catch (e) {
      // ignore
    }

    setOs(detected);
  }, []);

  // Decide main CTA label + href when user not logged in
  function getPrimaryCTALabel() {
    if (userToken) return "Open Dashboard";
    if (os === "ios") return "Download now";
    if (os === "android") return "Get started on the website";
    return "Create free account";
  }

  function getPrimaryCTAHref() {
    if (userToken) return "/dashboard";
    if (os === "ios") return APP_STORE_URL;
    if (os === "android") return WEBSITE_URL;
    return "/login";
  }

  function getPrimaryCTATarget() {
    // when sending to external store or website, open new tab
    if (!userToken && (os === "ios" || os === "android")) return "_blank";
    return undefined;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900">
      <SEO
        title="Expensease — Effortless expense splitting"
        description="Split bills, track group and personal spending, and settle up easily. Expensease makes shared finances simple and friendly."
        canonical="https://www.expensease.in/"
      />

      <NavBar />

      {/* HERO */}
      <header className="relative overflow-hidden mt-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 pt-20 pb-16 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            transition={{ duration: 0.5 }}
            className="max-w-2xl"
          >
            <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight">
              Split bills. Track money. Keep friendships.
            </h1>
            <p className="mt-4 text-lg text-slate-700">
              Expensease helps groups (friends, roommates, trips) share costs and settle up without awkwardness. Fast flows, clear summaries, and helpful nudges.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              {/* Primary CTA - behavior/label changes by OS */}
              {userToken ? (
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white px-5 py-3 font-semibold hover:scale-[1.01] transition"
                  aria-label="Go to dashboard"
                >
                  Open Dashboard
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
              ) : (
                // If CTA goes off-site, use <a> so target=_blank works
                (os === "ios" || os === "android") ? (
                  <a
                    href={getPrimaryCTAHref()}
                    target={getPrimaryCTATarget()}
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white px-5 py-3 font-semibold hover:scale-[1.01] transition"
                    aria-label={getPrimaryCTALabel()}
                  >
                    {getPrimaryCTALabel()}
                  </a>
                ) : (
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white px-5 py-3 font-semibold hover:scale-[1.01] transition"
                    aria-label="Sign up"
                  >
                    Get started — it's free
                  </Link>
                )
              )}

              <Link
                to="/features"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-slate-700 hover:bg-slate-100 transition"
                aria-label="View features"
              >
                Learn features
              </Link>
            </div>

            {/* Store badges */}
            <div className="mt-5 flex flex-wrap gap-3 items-center">
              {/* App Store badge shown only for iOS visitors (and always safe to show) */}
              <StoreBadge href={APP_STORE_URL} label="Open on the App Store">
                <div className="flex flex-col text-left">
                  <span className="text-[10px] text-slate-500">Download on the</span>
                  <span className="text-sm font-semibold">App Store</span>
                </div>
              </StoreBadge>

              {/* Play Store removed as requested */}
            </div>

            <div className="mt-8 grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">1</div>
                <div className="text-sm text-slate-500">Signup Steps</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{"<"}30s</div>
                <div className="text-sm text-slate-500">Average split time</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">99%</div>
                <div className="text-sm text-slate-500">Positive feedback</div>
              </div>
            </div>
          </motion.div>

          {/* Illustration */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="mx-auto"
            aria-hidden
          >
            {/* Illustration SVG (same as before) */}
            <svg viewBox="0 0 600 500" className="w-full max-w-md">
              <defs>
                <linearGradient id="g1" x1="0" x2="1">
                  <stop offset="0%" stopColor="#06b6d4" />
                  <stop offset="100%" stopColor="#7c3aed" />
                </linearGradient>
              </defs>
              <rect x="0" y="0" width="600" height="500" rx="24" fill="url(#g1)" opacity="0.08" />
              <g transform="translate(40,40)">
                <rect x="0" y="0" width="220" height="120" rx="12" fill="#fff" opacity="0.95" />
                <rect x="240" y="0" width="220" height="120" rx="12" fill="#fff" opacity="0.9" />
                <rect x="120" y="140" width="320" height="160" rx="12" fill="#fff" opacity="0.95" />
                <circle cx="40" cy="200" r="22" fill="#fff" opacity="0.95" />
              </g>
            </svg>
          </motion.div>
        </div>
      </header>

      {/* FEATURES */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.h2 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="text-2xl font-semibold text-center mb-8">
            Built for real groups — simple, fast, and transparent
          </motion.h2>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.article
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 * i }}
                  className="bg-white rounded-2xl p-6 shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-slate-50">
                      <Icon className="h-6 w-6 text-slate-700" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{f.title}</h3>
                      <p className="mt-1 text-sm text-slate-600">{f.copy}</p>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS / STEPS */}
      <section className="py-12 bg-slate-50">
        <div className="max-w-5xl mx-auto px-6">
          <h3 className="text-xl font-semibold text-center mb-6">How it works</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((s) => (
              <motion.div key={s.step} className="bg-white rounded-xl p-5 shadow-sm text-center" whileHover={{ y: -4 }}>
                <div className="mx-auto mb-3 h-12 w-12 flex items-center justify-center rounded-full bg-gradient-to-r from-teal-400 to-indigo-600 text-white font-semibold">
                  {s.step}
                </div>
                <h4 className="font-semibold">{s.title}</h4>
                <p className="mt-2 text-sm text-slate-600">{s.copy}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-12">
        <div className="mx-6 px-6">
          <h3 className="text-xl font-semibold text-center mb-6">Loved by students, groups and roommates</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {testimonials.map((t, idx) => (
              <motion.blockquote key={idx} className="bg-white p-6 rounded-xl shadow-sm flex flex-col justify-between">
                <p className="text-slate-700">“{t.text}”</p>
                <footer className="mt-4 text-sm text-slate-500">{t.name} • {t.role}</footer>
              </motion.blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-12 bg-gradient-to-r from-teal-50 to-indigo-50">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h3 className="text-2xl font-semibold mb-3">Ready to make splitting effortless?</h3>
          <p className="text-slate-600 mb-6">Create an account and try Expensease — free for small groups.</p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-4">
            {/* Primary CTA in final section mirrors header behavior */}
            {userToken ? (
              <Link to="/dashboard" className="rounded-xl bg-slate-900 text-white px-6 py-3 font-semibold">
                Open Dashboard
              </Link>
            ) : (os === "ios" || os === "android") ? (
              <a href={getPrimaryCTAHref()} target={getPrimaryCTATarget()} rel="noopener noreferrer" className="rounded-xl bg-slate-900 text-white px-6 py-3 font-semibold">
                {getPrimaryCTALabel()}
              </a>
            ) : (
              <Link to="/login" className="rounded-xl bg-slate-900 text-white px-6 py-3 font-semibold">
                Create free account
              </Link>
            )}

            {/* App Store badge only (Play Store intentionally removed) */}
            <div className="flex gap-2 mt-3 sm:mt-0">
              <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" aria-label="Open on the App Store" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <span className="text-sm">App Store</span>
              </a>
            </div>
          </div>

          <p className="text-xs text-slate-500">Available on iOS. Android users are redirected to the web experience.</p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
