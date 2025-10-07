// src/pages/Contact.jsx
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Mail, Send, Clipboard, CheckCircle, X } from "lucide-react";
import SEO from "../../components/SEO";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import Cookies from "js-cookie";
import { Link } from "react-router-dom";

/**
 * Contact page — matches Expensease UI/UX
 * - Dark/light unified theme consistent with Landing
 * - Framer Motion entrance animations
 * - Accessible form (labels, aria, keyboard)
 * - Primary action: open user's mail client via mailto (safe, no backend)
 * - Fallback/copy-to-clipboard and clear/friendly messages
 *
 * Note: backend send endpoint is not implemented here — mailto used as reliable client-side fallback.
 */

const SUPPORT_EMAIL = "email.expensease@gmail.com";

export default function Contact() {
    // prefill using a logged-in user detection (optional)
    const userToken = Cookies.get("userToken"); // if you use AuthContext, swap this
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [topic, setTopic] = useState("general");
    const [message, setMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [status, setStatus] = useState(null); // { type: 'success'|'error', msg: string }
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        // If user is signed in and you store profile, prefill email/name here
        // For now we just detect a token and show a hint
        if (userToken) {
            // Optionally, fetch profile from localStorage or context and setName/setEmail
            // const storedName = localStorage.getItem('ea_name'); if (storedName) setName(storedName);
        }
    }, [userToken]);

    // Basic validation
    function validate() {
        if (!message.trim()) {
            setStatus({ type: "error", msg: "Please write a short message describing your request." });
            return false;
        }
        if (!email.trim()) {
            // we'll still allow sending without email, but recommend adding it
            setStatus({ type: "error", msg: "Please include your email so we can respond." });
            return false;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            setStatus({ type: "error", msg: "Please enter a valid email address." });
            return false;
        }
        return true;
    }

    // Primary send: open default mail client via mailto:
    const handleSendMail = (e) => {
        e.preventDefault();
        setStatus(null);
        if (!validate()) return;

        setSubmitting(true);

        // Build a tidy subject/body
        const subject = encodeURIComponent(`[Expensease] ${topic === "general" ? "Support request" : topic}`);
        const bodyLines = [
            `Name: ${name || "—"}`,
            `Email: ${email}`,
            `Topic: ${topic}`,
            "",
            "Message:",
            message.trim(),
            "",
            "—",
            "Sent from Expensease contact form",
        ];
        const body = encodeURIComponent(bodyLines.join("\n"));

        // mailto URI
        const mailto = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;

        // Attempt to open mail client. Use window.location.href — most reliable for mailto.
        try {
            window.location.href = mailto;
            setStatus({ type: "success", msg: "Your email client should open — hit send to deliver your message." });
            // Keep the form content for the user to re-send if they return; optionally clear:
            // setName(""); setEmail(""); setMessage("");
        } catch (err) {
            console.error("mailto error:", err);
            setStatus({ type: "error", msg: "Couldn't open email client. Try copying the support email and sending manually." });
        } finally {
            setSubmitting(false);
        }
    };

    // Fallback: copy support email to clipboard
    async function handleCopyEmail() {
        try {
            await navigator.clipboard.writeText(SUPPORT_EMAIL);
            setCopied(true);
            setStatus({ type: "success", msg: `Support email copied: ${SUPPORT_EMAIL}` });
            setTimeout(() => setCopied(false), 3000);
        } catch (err) {
            console.error("copy failed", err);
            setStatus({ type: "error", msg: "Copy failed — please manually email " + SUPPORT_EMAIL });
        }
    }

    // Small helper to render status
    function StatusPill() {
        if (!status) return null;
        const isError = status.type === "error";
        return (
            <div
                role="status"
                aria-live="polite"
                className={`mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm ${isError ? "bg-rose-600/10 text-rose-300" : "bg-teal-600/10 text-teal-300"
                    }`}
            >
                {isError ? <X size={16} /> : <CheckCircle size={16} />}
                <span>{status.msg}</span>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900">
            <SEO
                title="Contact Us | Expensease"
                description="Contact Expensease support for help, feedback, or partnership inquiries."
                canonical="https://www.expensease.in/contact"
            />
            <NavBar />

            <main className="max-w-6xl mx-auto px-6 py-16 mt-16">
                <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
                    <div className="bg-[#0f0f0f] rounded-2xl p-8 border border-[#1b1b1b] text-white shadow-sm">
                        <div className="flex items-start gap-4">
                            <div className="p-3 rounded-lg bg-teal-600 text-black">
                                <Mail size={20} />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold">Contact Expensease</h1>
                                <p className="mt-2 text-sm text-slate-300 max-w-xl">
                                    Need help, found a bug, or want to suggest a feature? Fill the quick form below and we'll get back to you.
                                    If you prefer, email us directly at{" "}
                                    <button
                                        onClick={handleCopyEmail}
                                        className="inline-flex items-center gap-2 text-teal-400 underline"
                                        aria-label={`Copy support email ${SUPPORT_EMAIL}`}
                                    >
                                        {SUPPORT_EMAIL}
                                        <Clipboard size={14} />
                                    </button>
                                </p>

                                <div className="mt-3 text-xs text-slate-400">
                                    Typical response time: <strong>1–2 business days</strong>. Please do not share passwords or full credit card numbers here.
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Form column */}
                    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="md:col-span-2">
                        <form onSubmit={handleSendMail} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label htmlFor="contact-name" className="block text-sm font-medium text-slate-700">
                                        Your name (optional)
                                    </label>
                                    <input
                                        id="contact-name"
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="e.g., Priya Sharma"
                                        className="mt-1 block w-full rounded-md border border-slate-200 px-3 py-2 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="contact-email" className="block text-sm font-medium text-slate-700">
                                        Email (so we can reply)
                                    </label>
                                    <input
                                        id="contact-email"
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@domain.com"
                                        className="mt-1 block w-full rounded-md border border-slate-200 px-3 py-2 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400"
                                        aria-required="true"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="contact-topic" className="block text-sm font-medium text-slate-700">
                                        Topic
                                    </label>
                                    <select
                                        id="contact-topic"
                                        value={topic}
                                        onChange={(e) => setTopic(e.target.value)}
                                        className="mt-1 block w-full rounded-md border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400"
                                    >
                                        <option value="general">General question</option>
                                        <option value="bug">Report a bug</option>
                                        <option value="feature">Feature request</option>
                                        <option value="billing">Billing</option>
                                        <option value="partnership">Partnership</option>
                                    </select>
                                </div>

                                <div>
                                    <label htmlFor="contact-message" className="block text-sm font-medium text-slate-700">
                                        Message
                                    </label>
                                    <textarea
                                        id="contact-message"
                                        rows="6"
                                        required
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        placeholder="Tell us what's happening, include steps to reproduce bugs, or describe your idea."
                                        className="mt-1 block w-full rounded-md border border-slate-200 px-3 py-2 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400"
                                        aria-required="true"
                                    />
                                </div>

                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="submit"
                                            disabled={submitting}
                                            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 text-black px-4 py-2 font-semibold hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
                                            aria-label="Send message"
                                        >
                                            <Send size={16} />
                                            <span>{submitting ? "Preparing..." : "Email support"}</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={handleCopyEmail}
                                            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
                                            aria-label="Copy support email"
                                        >
                                            <Clipboard size={14} />
                                            <span>{copied ? "Copied!" : "Copy email"}</span>
                                        </button>
                                    </div>

                                    <div className="text-sm text-slate-500">
                                        <strong>Response:</strong> 1–2 business days
                                    </div>
                                </div>

                                <div>
                                    <StatusPill />
                                </div>
                            </div>
                        </form>

                        <div className="mt-6 text-sm text-slate-600">
                            <h4 className="font-medium mb-2">Tips for faster support</h4>
                            <ul className="list-disc ml-5 space-y-1">
                                <li>Include a short step-by-step to reproduce bugs (browser, OS, steps).</li>
                                <li>Attach timestamps or transaction IDs if your message is about a specific expense.</li>
                                <li>For account issues, sign in and mention your Google email so we can look up your account faster.</li>
                            </ul>
                        </div>
                    </motion.section>

                    {/* Right column: quick links / contact methods */}
                    <aside className="space-y-4">
                        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                            <h4 className="font-semibold mb-2">Other ways to reach us</h4>
                            <div className="flex items-start gap-3">
                                <div className="rounded-full p-2 bg-teal-600 text-black">
                                    <Mail size={16} />
                                </div>
                                <div className="text-sm">
                                    <div className="font-medium">Email</div>
                                    <div className="text-slate-500">{SUPPORT_EMAIL}</div>
                                </div>
                            </div>

                            <div className="mt-3">
                                <Link to="/faqs" className="text-sm text-teal-600 hover:underline">Check FAQs</Link>
                                <div className="text-xs text-slate-400 mt-2">Many common questions are answered in the FAQ — it’s the fastest way to get help for general topics.</div>
                            </div>
                        </motion.div>

                        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                            <h4 className="font-semibold mb-2">Security & privacy</h4>
                            <p className="text-sm text-slate-600">
                                Do not include passwords, one-time codes, or full credit card numbers in your message. We will only ask for minimal verification when necessary.
                            </p>
                        </motion.div>

                        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                            <h4 className="font-semibold mb-2">Business & partnerships</h4>
                            <p className="text-sm text-slate-600">Interested in partnerships or integrations? Tell us more — use the form above and select <strong>Partnership</strong>.</p>
                        </motion.div>
                    </aside>
                </div>
            </main>

            <Footer />
        </div>
    );
}
