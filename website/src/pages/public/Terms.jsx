// src/pages/public/Terms.jsx
import React from "react";
import { Link } from "react-router-dom";
import Cookies from "js-cookie";
import SEO from "../../components/SEO";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import { motion } from "framer-motion";
import { BookOpen, ShieldCheck, User, AlertTriangle } from "lucide-react";

const UPDATED = "August 27, 2025";
const SUPPORT_EMAIL = "email.expensease@gmail.com";

const fadeUp = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } };

export default function Terms() {
  const userToken = Cookies.get("userToken");

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900">
      <SEO
        title="Terms of Service | Expensease"
        description="Terms of Service for Expensease — rules and conditions for using the product."
        canonical="https://www.expensease.in/terms"
      />

      <NavBar />

      <main className="max-w-7xl mx-auto px-6 lg:px-8 py-16 mt-16">
        {/* Hero */}
        <motion.header initial="hidden" animate="visible" variants={fadeUp} className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start mb-10">
          <div className="md:col-span-2">
            <h1 className="text-4xl font-extrabold leading-tight">Terms of Service</h1>
            <p className="mt-3 text-lg text-slate-700">Last updated: <strong>{UPDATED}</strong></p>
            <p className="mt-4 text-slate-600 max-w-3xl">
              Please read these Terms carefully before using Expensease. These rules describe what you can expect from the service and what is expected of you. This is not legal advice — consult counsel if you require a legal review.
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

          {/* Right micro summary */}
          <aside className="rounded-2xl p-6 bg-white shadow-sm border border-slate-100">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-teal-50 text-teal-600">
                <BookOpen />
              </div>
              <div>
                <div className="text-sm font-semibold">Quick facts</div>
                <div className="mt-1 text-xs text-slate-500">Google-only sign-in • No built-in payments • Typical response: 1–2 business days</div>
              </div>
            </div>
          </aside>
        </motion.header>

        {/* TOC */}
        <nav className="mb-8">
          <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
            <div className="text-sm text-slate-600 mb-2">Contents</div>
            <ul className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <li><a href="#overview" className="text-teal-600 hover:underline">Overview</a></li>
              <li><a href="#accounts" className="text-teal-600 hover:underline">Accounts</a></li>
              <li><a href="#service" className="text-teal-600 hover:underline">Service</a></li>
              <li><a href="#acceptable-use" className="text-teal-600 hover:underline">Acceptable use</a></li>
              <li><a href="#fees" className="text-teal-600 hover:underline">Fees</a></li>
              <li><a href="#termination" className="text-teal-600 hover:underline">Termination</a></li>
              <li><a href="#disclaimer" className="text-teal-600 hover:underline">Disclaimer</a></li>
              <li><a href="#contact" className="text-teal-600 hover:underline">Contact</a></li>
            </ul>
          </div>
        </nav>

        {/* Article */}
        <article className="space-y-6">
          <section id="overview" className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="text-xl font-semibold">Overview</h2>
            <p className="mt-2 text-slate-700">
              These Terms govern your access to and use of Expensease. By accessing or using our Service you agree to these Terms. If you disagree, please do not use the Service.
            </p>
            <p className="mt-3 text-slate-600">
              Expensease is a lightweight tool to split and track shared expenses. The Service currently uses Google Sign-In to create and manage accounts. Expensease does not process payments — users remain responsible for settling payments between each other using external payment methods.
            </p>
          </section>

          <section id="accounts" className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="text-xl font-semibold">Accounts</h2>
            <p className="mt-2 text-slate-700">
              Accounts are created via Google Sign-In. Do not share your Google credentials. You are responsible for activity occurring under your account. If you suspect unauthorized access, contact support immediately.
            </p>
            {/* <div className="mt-4 text-sm text-slate-500">
              <div className="flex items-center gap-2"><User /> Minimum age: 13+</div>
            </div> */}
          </section>

          <section id="service" className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="text-xl font-semibold">Service description & limits</h2>
            <p className="mt-2 text-slate-700">
              Expensease provides features to create groups, add expenses, and track who owes whom. We may update, restrict, or remove features at our discretion. We do not provide financial, banking, or payment settlement services.
            </p>
            <p className="mt-3 text-slate-600">
              If you rely on Expensease for business-critical workflows, maintain backups of important records; we are not responsible for user-created records that are lost due to external factors.
            </p>
          </section>

          <section id="acceptable-use" className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="text-xl font-semibold">Acceptable use</h2>
            <p className="mt-2 text-slate-700">
              You must not use the Service to harass, defraud, or facilitate unlawful activities. You must not submit content (notes, descriptions) that you don’t have the right to share.
            </p>
            <p className="mt-3 text-slate-600">We reserve the right to suspend or remove content or accounts that violate these Terms.</p>
          </section>

          <section id="fees" className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="text-xl font-semibold">Fees</h2>
            <p className="mt-2 text-slate-700">
              Expensease is free to use at present. If paid plans are introduced, they will be described on the website with pricing and billing terms.
            </p>
          </section>

          <section id="termination" className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="text-xl font-semibold">Termination & account deletion</h2>
            <p className="mt-2 text-slate-700">
              We may suspend or terminate accounts for violations. You can request account deletion by contacting support. Account deletion may remove all data associated with your account.
            </p>
          </section>

          <section id="disclaimer" className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="text-xl font-semibold">Disclaimer</h2>
            <p className="mt-2 text-slate-700">
              THE SERVICE IS PROVIDED AS IS AND AS AVAILABLE. WE DISCLAIM IMPLIED WARRANTIES TO THE MAXIMUM EXTENT PERMITTED BY LAW.
            </p>
          </section>

          <section id="liability" className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="text-xl font-semibold">Limitation of liability</h2>
            <p className="mt-2 text-slate-700">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, EXPENSEASE WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL OR CONSEQUENTIAL DAMAGES ARISING FROM YOUR USE OF THE SERVICE.
            </p>
          </section>

          <section id="contact" className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="text-xl font-semibold">Contact</h2>
            <p className="mt-2 text-slate-700">
              Questions or requests? Email us: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-teal-600 hover:underline">{SUPPORT_EMAIL}</a>
            </p>
            <p className="mt-3 text-xs text-slate-500">
              Note: these Terms are a template for your convenience and do not constitute legal advice. Please consult a qualified attorney to adapt these terms to your business needs.
            </p>
          </section>
        </article>

        {/* Final CTA */}
        <section className="mt-12 bg-gradient-to-r from-teal-50 to-indigo-50 rounded-2xl p-8 text-center">
          <h3 className="text-2xl font-semibold">Ready to try Expensease?</h3>
          <p className="mt-2 text-slate-600">Create an account and start splitting expenses with friends — safe and private.</p>
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
