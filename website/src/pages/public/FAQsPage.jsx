import React, { useState, useMemo } from "react";
import SEO from "../../components/SEO";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import {
  ChevronDown,
  ChevronUp,
  Search as SearchIcon,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Expensease — Improved FAQ page
// Key UX improvements:
// - Live searchable FAQ with category chips
// - Accessible accordion buttons with aria attributes
// - Smooth open/close animations via framer-motion
// - "Was this helpful?" lightweight feedback UI (local-only)
// - Clear CTA: still-have-questions -> contact form / support

const FAQS = [
  {
    id: 1,
    q: "How do I add a personal expense?",
    category: "Getting started",
    a: (
      <>
        <p>
          <strong>On mobile</strong>: Tap the <span className="font-semibold">+</span> action button in the navbar and choose <em>New expense</em>.
        </p>
        <p>
          <strong>On desktop</strong>: Click <em>New expense</em> in the sidebar.
        </p>
        <p className="mt-2">Required fields:
        </p>
        <ul className="list-disc ml-6 mt-2">
          <li>Description</li>
          <li>Amount & currency</li>
          <li>Date</li>
          <li>Category (optional)</li>
        </ul>
        <p className="mt-2">Tap <strong>Save</strong> — the expense will appear in your personal timeline and any selected group.</p>
      </>
    ),
  },
  {
    id: 2,
    q: "How do I create a group or add friends?",
    category: "Groups",
    a: (
      <>
        <p>Create a group from the <em>Groups</em> page and invite people by link or 4‑digit code. Friends can also be added using their email.</p>
        <p className="mt-2">Invites are private; only people with the link/code can join unless the group admin opens it.</p>
      </>
    ),
  },
  {
    id: 3,
    q: "How do I split an expense with a friend or group?",
    category: "Features",
    a: (
      <>
        <p>Choose a group or friend, click <em>New expense</em>, enter amount and select a split type:</p>
        <ul className="list-disc ml-6 mt-2">
          <li>Equal — everyone pays the same</li>
          <li>Percent — set percentages per person</li>
          <li>Manual — enter exact amounts per person</li>
        </ul>
        <p className="mt-2">You can attach a receipt and add notes. Click <strong>Save</strong> to finalize the split.</p>
      </>
    ),
  },
  {
    id: 4,
    q: "Can I record loans or IOUs?",
    category: "Features",
    a: (
      <>
        <p>Yes — use <em>New loan</em> to record when a friend borrows or lends money. Loans appear in the same place as expenses and can be settled like normal expenses.</p>
        <p className="mt-2">Add a note and due date to keep track of repayment expectations.</p>
      </>
    ),
  },
  {
    id: 5,
    q: "How does privacy work for groups?",
    category: "Privacy",
    a: (
      <>
        <p>Group admins can control visibility. By default, only members see group expenses. Admins may mark specific expenses as visible to a subset of members when needed.</p>
        <p className="mt-2">We collect minimal personal data — you control who sees what, and you can export your data anytime.</p>
      </>
    ),
  },
  {
    id: 6,
    q: "Are there any charges?",
    category: "Account",
    a: <p>Expensease is free for small groups. We'll announce pricing for advanced features when they're ready — and you'll always see pricing before you opt in.</p>,
  },
  {
    id: 7,
    q: "How do I manage payment methods?",
    category: "Payments",
    a: (
      <>
        <p>Go to <em>Account → Payment methods</em> to add or remove saved payment accounts. You can use these to record settlements faster, but they are never charged automatically without your consent.</p>
      </>
    ),
  },
//   {
//     id: 8,
//     q: "Can I change my email or delete my account?",
//     category: "Account",
//     a: (
//       <>
//         <p>You can update your email from <em>Account settings</em>. To delete your account, go to <em>Account → Danger zone → Delete account</em>. Deleting removes your personal data; groups you created will be transferred or removed depending on membership.</p>
//       </>
//     ),
//   },
//   {
//     id: 9,
//     q: "How secure is my data?",
//     category: "Privacy",
//     a: (
//       <>
//         <p>We use industry-standard practices to protect data in transit and at rest. Sensitive operations are authenticated and your data is only shared within groups you belong to.</p>
//         <p className="mt-2">If you have a security concern, please email <a href="mailto:security@expensease.in" className="underline">security@expensease.in</a>.</p>
//       </>
//     ),
//   },
  {
    id: 10,
    q: "I still have a question — can I contact support?",
    category: "Support",
    a: (
      <>
        <p>Yes! Use the <em>Help → Contact support</em> link in the app or email <a href="mailto:email.expensease@gmail.com" className="underline">email.expensease@gmail.com</a>. For quick issues, try the in‑app chat.</p>
      </>
    ),
  },
];

const CATEGORIES = ["All", "Getting started", "Groups", "Features", "Payments", "Privacy", "Account", "Support"];

export default function FAQ() {
  const [openId, setOpenId] = useState(null);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [feedback, setFeedback] = useState({}); // {faqId: 'up'|'down'}

  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return FAQS.filter((f) => {
      if (activeCategory !== "All" && f.category !== activeCategory) return false;
      if (!normalizedQuery) return true;
      const hay = (f.q + " " + (typeof f.a === "string" ? f.a : "")).toLowerCase();
      return hay.includes(normalizedQuery);
    });
  }, [query, activeCategory]);

  const popular = FAQS.slice(0, 3);

  function toggle(id) {
    setOpenId(openId === id ? null : id);
  }

  function markHelpful(id, type) {
    setFeedback((s) => ({ ...s, [id]: s[id] === type ? undefined : type }));
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900">
      <SEO title="FAQs | Expensease" description="Frequently asked questions about Expensease — features, privacy, and how to use the app." />
      <NavBar />

      <main className="max-w-5xl mx-auto px-6 py-16 mt-16">
        <section className="text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold">Frequently Asked Questions</h1>
          <p className="mt-2 text-slate-600">Got a question? Search the help center or browse our most common topics below.</p>

          {/* Search */}
          <div className="mt-6 flex items-center justify-center">
            <div className="w-full max-w-2xl relative">
              <SearchIcon className="absolute left-3 top-3 text-slate-400" size={18} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search help: e.g. 'split', 'privacy', 'loan'"
                className="pl-10 pr-10 w-full rounded-xl border border-slate-200 p-3 shadow-sm focus:outline-none"
                aria-label="Search FAQs"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-2 p-2 rounded-md hover:bg-slate-100"
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Category chips */}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setActiveCategory(c)}
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  activeCategory === c ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-700"
                }`}
                aria-pressed={activeCategory === c}
              >
                {c}
              </button>
            ))}
          </div>
        </section>

        {/* Popular quick links */}
        <section className="mt-10">
          <h3 className="text-lg font-semibold">Popular questions</h3>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {popular.map((p) => (
              <button key={p.id} onClick={() => setOpenId(p.id)} className="text-left rounded-lg p-3 bg-white shadow-sm hover:shadow-md">
                <div className="font-medium">{p.q}</div>
                <div className="text-sm text-slate-500 mt-1">{p.category}</div>
              </button>
            ))}
          </div>
        </section>

        {/* FAQ list */}
        <section className="mt-10">
          <div className="space-y-3">
            {filtered.length === 0 && (
              <div className="bg-white rounded-xl p-6 text-center shadow-sm">
                <p className="font-medium">No results found</p>
                <p className="text-sm text-slate-600 mt-2">Try different keywords or  <a href="/contact" className="underline">contact page</a>.</p>
              </div>
            )}

            {filtered.map((faq) => (
              <div key={faq.id} className="bg-white rounded-xl overflow-hidden shadow-sm">
                <button
                  className="w-full flex items-center justify-between px-4 py-4 text-left"
                  onClick={() => toggle(faq.id)}
                  aria-expanded={openId === faq.id}
                >
                  <div>
                    <div className="font-medium">{faq.q}</div>
                    <div className="text-xs text-slate-500 mt-1">{faq.category}</div>
                  </div>

                  <div className="ml-4 flex items-center">
                    {openId === faq.id ? <ChevronUp className="text-slate-600" /> : <ChevronDown className="text-slate-600" />}
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {openId === faq.id && (
                    <motion.div
                      key="content"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18 }}
                      className="px-4 pb-4 pt-0 border-t border-slate-100 text-slate-700"
                    >
                      <div className="mt-3">{faq.a}</div>

                      {/* Helpful */}
                      <div className="mt-4 flex items-center gap-3">
                        <div className="text-sm text-slate-600">Was this helpful?</div>
                        <button
                          onClick={() => markHelpful(faq.id, "up")}
                          className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm ${feedback[faq.id] === "up" ? "bg-teal-100 text-teal-700" : "bg-slate-50 text-slate-700"}`}
                          aria-pressed={feedback[faq.id] === "up"}
                        >
                          <ThumbsUp size={16} /> Yes
                        </button>

                        <button
                          onClick={() => markHelpful(faq.id, "down")}
                          className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm ${feedback[faq.id] === "down" ? "bg-rose-100 text-rose-700" : "bg-slate-50 text-slate-700"}`}
                          aria-pressed={feedback[faq.id] === "down"}
                        >
                          <ThumbsDown size={16} /> No
                        </button>

                        {feedback[faq.id] && (
                          <div className="ml-auto text-sm text-slate-500">Thanks — your feedback helps us improve.</div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mt-10 grid md:grid-cols-2 gap-6 items-center">
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h4 className="font-semibold">Still have a question?</h4>
            <p className="mt-2 text-sm text-slate-600">Reach out to our support team — we usually reply within a business day.</p>
            <div className="mt-4">
              <a href="/contact" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white px-4 py-2">Contact support <MessageSquare size={16} /></a>
            </div>
          </div>

          <div className="rounded-2xl p-6 bg-gradient-to-r from-teal-50 to-indigo-50 text-center">
            <h4 className="font-semibold">Want to request a feature?</h4>
            <p className="mt-2 text-sm text-slate-700">Tell us what would make Expensease better for you — feature requests directly influence our roadmap.</p>
            <div className="mt-4">
              <a href="/feedback" className="inline-flex items-center gap-2 rounded-xl border px-4 py-2">Suggest a feature</a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
