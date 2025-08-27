// src/pages/public/Privacy.jsx
import React from "react";
import { Link } from "react-router-dom";
import Cookies from "js-cookie";
import SEO from "../../components/SEO";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import { motion } from "framer-motion";
import { ShieldCheck, Users, FileText } from "lucide-react";

const UPDATED = "August 27, 2025";
const SUPPORT_EMAIL = "email.expensease@gmail.com";

const fadeUp = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } };

export default function Privacy() {
  const userToken = Cookies.get("userToken");

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900">
      <SEO
        title="Privacy Policy | Expensease"
        description="Privacy Policy describing what data Expensease collects and how we handle it."
        canonical="https://www.expensease.in/privacy"
      />

      <NavBar />

      <main className="max-w-7xl mx-auto px-6 lg:px-8 py-16 mt-16">
        {/* Hero */}
        <motion.header initial="hidden" animate="visible" variants={fadeUp} className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start mb-10">
          <div className="md:col-span-2">
            <h1 className="text-4xl font-extrabold leading-tight">Privacy Policy</h1>
            <p className="mt-3 text-lg text-slate-700">Last updated: <strong>{UPDATED}</strong></p>
            <p className="mt-4 text-slate-600 max-w-3xl">
              We respect your privacy. This policy explains what we collect, how we use it, and the choices you have. If you sign in with Google, we only request the basic profile information (name and email) needed to create your account.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              {userToken ? (
                <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white px-5 py-3 font-semibold">
                  Open Dashboard
                </Link>
              ) : (
                <Link to="/login" className="inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white px-5 py-3 font-semibold">
                  Create free account
                </Link>
              )}

              <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-slate-700 hover:bg-slate-100">
                Contact support
              </a>
            </div>
          </div>

          <aside className="rounded-2xl p-6 bg-white shadow-sm border border-slate-100">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-teal-50 text-teal-600">
                <ShieldCheck />
              </div>
              <div>
                <div className="text-sm font-semibold">Highlights</div>
                <div className="mt-1 text-xs text-slate-500">We collect name & email (Google) • Usage analytics • Support messages</div>
              </div>
            </div>
          </aside>
        </motion.header>


        <article className="space-y-6">
          <section id="data" className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="text-xl font-semibold">Data we collect</h2>
            <p className="mt-2 text-slate-700">
              <strong>Account info:</strong> When you sign in with Google we collect your name and email to create and manage your account. We do not request your Google password.
            </p>
            <p className="mt-3 text-slate-700">
              <strong>Usage data:</strong> We collect anonymous/aggregate analytics and basic usage events to improve the product (page visits, feature usage). We do not tie analytics to sensitive fields beyond normal account identifiers.
            </p>
            <p className="mt-3 text-slate-700">
              <strong>Support messages:</strong> If you contact support, we retain the message and provided contact details to respond.
            </p>
            <p className="mt-3 text-slate-600">
              <strong>We do not:</strong> collect payment card details, scan receipts, or process bank transfers as part of the core product at this time.
            </p>
          </section>

          <section id="use" className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="text-xl font-semibold">How we use data</h2>
            <ul className="list-disc ml-5 mt-3 text-slate-700">
              <li>Create and manage your account (authentication via Google).</li>
              <li>Provide and improve the Service (product analytics, performance).</li>
              <li>Respond to support requests and security incidents.</li>
              <li>Comply with legal obligations as required.</li>
            </ul>
          </section>

          <section id="sharing" className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="text-xl font-semibold">Sharing & service providers</h2>
            <p className="mt-2 text-slate-700">
              We use third-party providers for hosting, authentication (Google), analytics, and email delivery. We limit the data shared to what is necessary for the provider to perform its service.
            </p>
            <p className="mt-3 text-slate-600">We will not sell your personal data.</p>
          </section>

          <section id="retention" className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="text-xl font-semibold">Data retention</h2>
            <p className="mt-2 text-slate-700">
              We retain personal data while your account is active and as needed to provide the Service, resolve disputes, or comply with legal obligations. You can request deletion by contacting support.
            </p>
          </section>

          <section id="rights" className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="text-xl font-semibold">Your rights</h2>
            <p className="mt-2 text-slate-700">
              Depending on your jurisdiction you may have rights to access, correct, export, or delete your personal data, or to object to processing. To exercise rights, email: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-teal-600 hover:underline">{SUPPORT_EMAIL}</a>.
            </p>
          </section>

          <section id="security" className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="text-xl font-semibold">Security</h2>
            <p className="mt-2 text-slate-700">
              We use industry-standard measures to protect data in transit and at rest. While we strive to keep data secure, no system is perfect — we will notify affected users in line with applicable law in the event of a material security incident.
            </p>
          </section>

          <section id="children" className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="text-xl font-semibold">Children</h2>
            <p className="mt-2 text-slate-700">
              The Service is not directed at children under 13. We do not knowingly collect personal information from children under 13.
            </p>
          </section>

          <section id="contact" className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="text-xl font-semibold">Contact</h2>
            <p className="mt-2 text-slate-700">
              Questions or requests? Email: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-teal-600 hover:underline">{SUPPORT_EMAIL}</a>
            </p>
            <p className="mt-3 text-xs text-slate-500">
              This Privacy Policy is a template for convenience and does not replace legal advice. If you plan to handle payments, attachments, or introduce new services, update this policy to reflect those flows.
            </p>
          </section>
        </article>

        {/* CTA */}
        <section className="mt-12 bg-gradient-to-r from-teal-50 to-indigo-50 rounded-2xl p-8 text-center">
          <h3 className="text-2xl font-semibold">Ready to try Expensease?</h3>
          <p className="mt-2 text-slate-600">Create an account and start splitting expenses with friends — quick and private.</p>
          <div className="mt-4">
            <Link to={userToken ? "/dashboard" : "/login"} className="rounded-xl bg-slate-900 text-white px-6 py-3 font-semibold">
              {userToken ? "Open Dashboard" : "Create free account"}
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
