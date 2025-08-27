import React from "react";
import SEO from "../../components/SEO";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import { Users, DollarSign, Shield, Clock, CheckCircle, MapPin } from "lucide-react";
import { motion } from "framer-motion";

// About page for Expensease — matches the LandingPage's UI/UX
// - Tailwind-first, mobile-first responsive layout
// - Motion for subtle polish
// - Placeholder avatars and copy — replace with real assets & numbers

const values = [
  {
    icon: Users,
    title: "Community first",
    copy: "We design for groups — friends, roommates, and teams get clear, fair splits.",
  },
  {
    icon: DollarSign,
    title: "Financial clarity",
    copy: "Summaries and charts so money conversations stay calm and simple.",
  },
  {
    icon: Shield,
    title: "Respect & privacy",
    copy: "We keep personal data minimal and keep private flows straightforward.",
  },
];

const team = [
  { name: "Founder", role: "Product & Engineering", initials: "PB" },
];

export default function About() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900">
      <SEO title="About | Expensease" description="Learn more about Expensease — mission, values, and the team building simple, honest expense tools." />
      <NavBar />

      <main className="pt-24 pb-16">
        <div className="max-w-6xl mx-auto px-6">
          {/* HERO */}
          <section className="text-center py-8">
            <motion.h1 initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-4xl sm:text-5xl font-extrabold">
              About Expensease
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }} className="mt-4 max-w-3xl mx-auto text-lg text-slate-700">
              Simple tools to share costs, reduce awkward money talk, and keep group finances transparent. Built lightweight, focused, and easy to use.
            </motion.p>

            {/* Early-stage metrics (authentic & honest) */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold">10+</div>
                <div className="text-sm text-slate-500">Early beta users</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">&lt;30s</div>
                <div className="text-sm text-slate-500">Average time to record a split</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">3 steps</div>
                <div className="text-sm text-slate-500">Add → split → settle</div>
              </div>
            </div>
          </section>

          {/* Mission & Values */}
          <section className="mt-12 grid gap-8 md:grid-cols-3">
            {values.map((v, i) => {
              const Icon = v.icon;
              return (
                <motion.article key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * i }} className="bg-white rounded-2xl p-6 shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-slate-50">
                      <Icon className="h-6 w-6 text-slate-700" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{v.title}</h3>
                      <p className="mt-1 text-sm text-slate-600">{v.copy}</p>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </section>

          {/* Our story */}
          <section className="mt-12 bg-slate-50 rounded-2xl p-6">
            <div className="grid md:grid-cols-2 gap-6 items-center">
              <div>
                <h3 className="text-2xl font-semibold">Our story</h3>
                <p className="mt-3 text-slate-700">
                  Expensease started as a solution for friends and roommates who were tired of messy spreadsheets, missed receipts, and awkward "who owes what" chats. We set out to build a product that is fast to use, easy to understand, and flexible enough for trips, monthly bills, and one-off events.
                </p>

                <ul className="mt-4 space-y-2 text-sm text-slate-600">
                  <li>• Focus on clarity — short flows and clear language.</li>
                  <li>• Minimal data collection — privacy-first defaults.</li>
                  <li>• Designed for humans — reduce friction and friction costs.</li>
                </ul>
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold">Roadmap highlights</h4>
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-teal-100 text-teal-700">1</span>
                    <div>
                      <div className="font-medium">Mobile private beta</div>
                      <div className="text-sm text-slate-500">Invite-only beta coming soon for Android & iOS.</div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-indigo-100 text-indigo-700">2</span>
                    <div>
                      <div className="font-medium">Simpler settlements</div>
                      <div className="text-sm text-slate-500">UPI support for faster settlement flows.</div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-slate-100 text-slate-700">3</span>
                    <div>
                      <div className="font-medium">Smarter suggestions</div>
                      <div className="text-sm text-slate-500">Auto-splitting suggestions and repeat-expense templates.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Team */}
          <section className="mt-12">
            <h3 className="text-2xl font-semibold">The team</h3>
            {/* <p className="mt-2 text-sm text-slate-600">Small, scrappy, and focused. Replace these placeholders with real avatars and bios.</p> */}

            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {team.map((m, idx) => (
                <div key={idx} className="bg-white rounded-2xl p-4 text-center shadow-sm">
                  <div className="mx-auto h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center text-lg font-semibold text-slate-700">{m.initials}</div>
                  <div className="mt-3 font-medium">{m.name}</div>
                  <div className="text-sm text-slate-500">{m.role}</div>
                </div>
              ))}

            </div>
          </section>

          {/* Privacy & CTA */}
          <section className="mt-12 grid md:grid-cols-2 gap-6 items-center">
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-slate-50">
                  <Shield className="h-6 w-6 text-slate-700" />
                </div>
                <div>
                  <h4 className="font-semibold">Privacy & security</h4>
                  <p className="mt-2 text-sm text-slate-600">We collect the minimum data needed to make splits work. You control who sees what, groups can be made private.</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl p-6 bg-gradient-to-r from-teal-50 to-indigo-50 text-center">
              <h4 className="text-xl font-semibold">Try Expensease</h4>
              <p className="mt-2 text-sm text-slate-700">Create an account and invite friends — free for small groups.</p>
              <div className="mt-5 flex justify-center gap-3">
                <a href="/login" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white px-5 py-3 font-semibold">Create free account</a>
                {/* <a href="/learn-more" className="inline-flex items-center gap-2 rounded-xl border px-4 py-3">See product demo</a> */}
              </div>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
