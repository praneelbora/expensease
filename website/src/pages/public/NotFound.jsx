// src/pages/NotFound.jsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Cookies from "js-cookie";
import SEO from "../../components/SEO";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import { motion } from "framer-motion";
import { Home, Search, Mail, Link as LinkIcon, Clipboard, AlertCircle } from "lucide-react";
import { logEvent } from "../../utils/analytics";

/**
 * 404 / Not Found page — Dark theme
 *
 * UX decisions:
 * - Keep tone helpful and friendly (reduces user frustration).
 * - Provide immediate recovery paths (home, dashboard, search, contact).
 * - Make reporting easy (prefilled mailto with current path + UA).
 * - Avoid heavy animations; use subtle motion for perceived polish.
 *
 * Integrates with:
 * - SEO component for page meta
 * - NavBar + Footer for consistent layout
 * - Cookies to detect if user is signed in (show dashboard CTA)
 */

const SUPPORT_EMAIL = "email.expensease@gmail.com";

export default function NotFound() {
  const navigate = useNavigate();
  const userToken = Cookies.get("userToken");
  const [searchQ, setSearchQ] = useState("");
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const suggestedPages = [
    { title: "Home", to: "/" , icon: <Home size={18} /> },
    { title: "Features", to: "/features", icon: <Search size={18} /> },
    { title: "Blogs", to: "/blogs", icon: <Search size={18} /> },
    { title: "FAQ", to: "/faqs", icon: <AlertCircle size={18} /> },
    { title: "About", to: "/about", icon: <LinkIcon size={18} /> },
    { title: "Contact", to: "/contact", icon: <Mail size={18} /> },
  ];

  function handleSearch(e) {
    e.preventDefault();
    const q = searchQ.trim();
    if (!q) {
      setStatusMsg({ type: "error", text: "Try a keyword like “split expenses” or “rent”." });
      setTimeout(() => setStatusMsg(null), 3500);
      return;
    }
    logEvent && logEvent("404_search", { query: q });
    // Redirect to blogs with search param (Blog page reads query param)
    navigate(`/blogs?search=${encodeURIComponent(q)}`);
  }

  function handleCopyUrl() {
    const url = window.location.href;
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        setStatusMsg({ type: "success", text: "Link copied to clipboard — paste it in your report." });
        logEvent && logEvent("404_copy_link");
        setTimeout(() => {
          setCopied(false);
          setStatusMsg(null);
        }, 2500);
      },
      () => {
        setStatusMsg({ type: "error", text: `Couldn't copy link. Please copy manually: ${url}` });
      }
    );
  }

  function handleReport() {
    const path = window.location.pathname + window.location.search;
    const subject = encodeURIComponent(`Broken link / missing page: ${path}`);
    const bodyLines = [
      `URL: ${window.location.href}`,
      `Time: ${new Date().toISOString()}`,
      `User Agent: ${navigator.userAgent}`,
      "",
      "What happened (short):",
      "",
      "Steps to reproduce (if any):",
      "",
      "Your email (so we can follow up):",
      "",
      "---",
      "Sent from Expensease 404 report",
    ];
    const body = encodeURIComponent(bodyLines.join("\n"));
    logEvent && logEvent("404_report_clicked", { path });
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  }

  function handleRandomSuggestion() {
    const idx = Math.floor(Math.random() * suggestedPages.length);
    const pick = suggestedPages[idx];
    logEvent && logEvent("404_suggestion_random", { pick: pick.title });
    navigate(pick.to);
  }

  const container = {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { staggerChildren: 0.04 } },
  };

  const cardHover = { scale: 1.02, y: -4 };

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-[#EBF1D5]">
      <SEO
        title="404 — Page not found | Expensease"
        description="We couldn't find that page. Try searching our guides or contact support."
        canonical="https://www.expensease.in/404"
        // suggest noindex for 404 to avoid indexing broken URLs
        schema={null}
      />
      {/* ensure crawlers don't index this view */}
      <meta name="robots" content="noindex" />

      <NavBar />

      <main role="main" className="max-w-6xl mx-auto px-6 py-20 mt-16">
        <motion.section initial="hidden" animate="show" variants={container} className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          {/* Left hero */}
          <motion.div variants={container} className="md:col-span-2 bg-[#121212] border border-[#1b1b1b] rounded-2xl p-10 shadow-lg">
            <div className="flex items-start gap-6">
              <div className="flex-shrink-0 rounded-full bg-gradient-to-br from-teal-500 to-indigo-600 p-3">
                <AlertCircle size={28} className="text-black" />
              </div>

              <div className="flex-1">
                <h1 className="text-4xl font-extrabold mb-2 text-white">404 — Page not found</h1>
                <p className="text-slate-400 mb-4 text-lg">
                  Oops — the page you're looking for doesn't exist (or moved). Let's get you back on track.
                </p>

                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                  <Link to="/" className="inline-flex items-center gap-3 rounded-xl bg-[#0f1720] border border-[#262626] px-4 py-3 hover:shadow-md transition">
                    <div><Home size={16} /></div> Home
                  </Link>

                  {userToken ? (
                    <Link to="/dashboard" className="inline-flex items-center gap-3 rounded-xl bg-teal-600 text-black px-4 py-3 hover:bg-teal-700 transition">
                      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
                      Open Dashboard
                    </Link>
                  ) : (
                    <Link to="/login" className="inline-flex items-center gap-3 rounded-xl bg-teal-600 text-black px-4 py-3 hover:bg-teal-700 transition">
                      <div><Home size={16} /></div> Create account
                    </Link>
                  )}

                  <button
                    onClick={handleRandomSuggestion}
                    className="inline-flex items-center gap-3 rounded-xl border border-[#262626] px-4 py-3 hover:bg-white/3 transition"
                    aria-label="Surprise me"
                  >
                    Surprise me
                    <span aria-hidden> →</span>
                  </button>
                </div>

                <div className="mt-6">
                  <form onSubmit={handleSearch} className="flex gap-2 items-center">
                    <label htmlFor="site-search" className="sr-only">Search site</label>
                    <div className="flex-1 relative">
                      <input
                        id="site-search"
                        value={searchQ}
                        onChange={(e) => setSearchQ(e.target.value)}
                        placeholder={`Search articles or topics — e.g. \"split expenses\"`}
                        className="w-full rounded-xl bg-[#050505] border border-[#222] px-4 py-3 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        aria-label="Search site"
                      />
                      <div className="absolute right-3 top-3">
                        <Search size={18} className="text-slate-400" />
                      </div>
                    </div>

                    <button type="submit" className="px-4 py-3 bg-teal-600 text-black rounded-xl font-semibold hover:bg-teal-700">
                      Search
                    </button>
                  </form>

                  <div className="mt-3 text-xs text-slate-500">
                    Tip: try searching our <Link to="/blogs" className="underline text-teal-400">guides</Link> or <Link to="/faqs" className="underline text-teal-400">FAQ</Link>.
                  </div>
                </div>

                {/* status */}
                {statusMsg && (
                  <div
                    role="status"
                    aria-live="polite"
                    className={`mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm ${
                      statusMsg.type === "error" ? "bg-rose-600/10 text-rose-300" : "bg-teal-600/10 text-teal-300"
                    }`}
                  >
                    {statusMsg.type === "error" ? <AlertCircle size={14} /> : <CheckCircle size={14} />}
                    <span>{statusMsg.text}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Explanation / Suggestions */}
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                { title: "Features", desc: "Quick look at what Expensease can do.", to: "/features" },
                { title: "Blogs", desc: "Guides & tips on splitting and personal finance.", to: "/blogs" },
                { title: "Contact", desc: "Report issues or get help from our team.", to: "/contact" },
              ].map((s) => (
                <motion.article key={s.to} whileHover={cardHover} className="bg-[#0b0b0b] border border-[#171717] p-4 rounded-xl">
                  <h4 className="font-semibold text-white">{s.title}</h4>
                  <p className="text-slate-400 text-sm mt-2">{s.desc}</p>
                  <Link to={s.to} className="mt-3 inline-block text-sm text-teal-400 hover:underline">Open →</Link>
                </motion.article>
              ))}
            </div>
          </motion.div>

          {/* Right column (compact utilities) */}
          <aside className="space-y-4">
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="bg-[#121212] border border-[#1b1b1b] rounded-xl p-4">
              <h4 className="text-sm font-semibold text-white mb-2">Quick actions</h4>

              <div className="flex flex-col gap-2">
                {/* <button
                  onClick={handleCopyUrl}
                  className="w-full inline-flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-[#0f0f0f] border border-[#262626] hover:bg-white/3"
                  aria-label="Copy current page link"
                >
                  <span className="flex items-center gap-2"><Clipboard size={16} /> Copy link</span>
                  <span className="text-xs text-slate-400">{copied ? "Copied" : "Copy"}</span>
                </button> */}

                <button
                  onClick={handleReport}
                  className="w-full inline-flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-teal-600 text-black font-semibold hover:bg-teal-700"
                  aria-label="Report broken link"
                >
                  <span className="flex items-center gap-2"><Mail size={16} /> Report issue</span>
                  <span className="text-xs">Email</span>
                </button>

                <button
                  onClick={() => navigate("/contact")}
                  className="w-full inline-flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-[#262626] hover:bg-white/3"
                  aria-label="Contact support"
                >
                  <span className="flex items-center gap-2"><Mail size={16} /> Contact</span>
                  <span className="text-xs text-slate-400">Form</span>
                </button>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="bg-[#121212] border border-[#1b1b1b] rounded-xl p-4">
              <h4 className="text-sm font-semibold text-white mb-2">Suggested pages</h4>

              <div className="grid gap-2">
                {suggestedPages.map((p) => (
                  <Link
                    key={p.to}
                    to={p.to}
                    className="inline-flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-[#0f0f0f] hover:bg-white/3"
                  >
                    <span className="flex items-center gap-2 text-sm">{p.icon}<span>{p.title}</span></span>
                    <span className="text-xs text-slate-400">Open</span>
                  </Link>
                ))}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-[#121212] border border-[#1b1b1b] rounded-xl p-4">
              <h4 className="text-sm font-semibold text-white mb-2">Need immediate help?</h4>
              <p className="text-slate-400 text-sm mb-3">Email us and include the broken URL — we'll investigate quickly.</p>
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Urgent support needed")}`}
                className="inline-flex items-center gap-2 rounded-md bg-teal-600 text-black px-3 py-2 font-semibold"
              >
                <Mail size={16} /> Email support
              </a>
            </motion.div>
          </aside>
        </motion.section>
      </main>

      <Footer />
    </div>
  );
}
