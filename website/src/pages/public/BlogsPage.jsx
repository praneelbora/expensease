import React, { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import SEO from "../../components/SEO";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import { getEnrichedPosts, getAllTags, BASE_URL } from "../../utils/blogs";

// Blog Index — matches Landing / Features / About UI/UX
// - Light base with teal accent (consistent with LandingPage and Features)
// - Framer Motion entrance + staggered card animation
// - Search, tags, sort, featured hero, load-more pagination
// - Subscribe CTA (local mock) and JSON-LD for SEO

const containerVariants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { staggerChildren: 0.06 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28 } },
};

export default function Blog() {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState(null);
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const perPage = 10;

  const [subscribed, setSubscribed] = useState(() => !!localStorage.getItem("ea_subscribed"));
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const enriched = useMemo(() => getEnrichedPosts(), []);
  const tags = useMemo(() => getAllTags(), []);

  useEffect(() => setPage(1), [query, activeTag, sort]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched
      .filter((p) => {
        if (activeTag && !(p.tags || []).includes(activeTag)) return false;
        if (!q) return true;
        return (
          p.title.toLowerCase().includes(q) ||
          p.excerpt.toLowerCase().includes(q) ||
          (p.tags || []).some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (sort === "featured") return (b.featured === true) - (a.featured === true) || new Date(b.datePublished) - new Date(a.datePublished);
        if (sort === "oldest") return new Date(a.datePublished) - new Date(b.datePublished);
        return new Date(b.datePublished) - new Date(a.datePublished);
      });
  }, [enriched, query, activeTag, sort]);

  const visible = useMemo(() => filtered.slice(0, page * perPage), [filtered, page]);
  const canLoadMore = visible.length < filtered.length;
  const featured = useMemo(() => enriched.find((p) => p.featured) || enriched[0], [enriched]);

  function clearFilters() {
    setQuery("");
    setActiveTag(null);
    setSort("newest");
  }

  async function handleSubscribe(e) {
    e.preventDefault();
    if (subscribed) return;
    const emailVal = email.trim();
    const ok = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailVal);
    if (!ok) return setSuccessMsg("Please enter a valid email.");
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 700));
    localStorage.setItem("ea_subscribed", "1");
    setSubscribed(true);
    setSubmitting(false);
    setSuccessMsg("Thanks — you're subscribed!");
  }

  const itemListJsonLd = useMemo(() => ({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: filtered.slice(0, 20).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${BASE_URL}/blogs/${p.slug}` })),
  }), [filtered]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900">
      <SEO title="Blog | Expensease" description="Guides and articles about splitting bills, personal finance and group money management." canonical={`${BASE_URL}/blogs`} />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />

      <NavBar />

      <main className="max-w-7xl mx-auto px-6 py-16 mt-16">
        {/* HERO */}
        <motion.header initial="hidden" animate="show" variants={containerVariants} className="mb-8">
          <div className="rounded-2xl bg-gradient-to-r from-teal-50 to-indigo-50 p-8 shadow-sm">
            <div className="md:flex md:items-center md:justify-between gap-6">
              <div className="md:flex-1">
                <motion.h1 variants={cardVariants} className="text-3xl sm:text-4xl font-extrabold">Insights & Guides</motion.h1>
                <motion.p variants={cardVariants} className="mt-2 text-slate-700 max-w-2xl">Actionable articles on splitting bills, tracking personal spending, and keeping group finances simple. Read tips, case-studies and product updates.</motion.p>

                <motion.div variants={cardVariants} className="mt-4 flex flex-wrap gap-3">
                  <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-3 py-1 text-sm">
                    <span className="font-semibold">{enriched.length}</span>
                    <span className="text-slate-500">articles</span>
                  </div>

                  <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-3 py-1 text-sm">
                    <span className="font-semibold">{featured ? featured.dateDisplay : ""}</span>
                    <span className="text-slate-500">latest</span>
                  </div>

                  <div className="inline-flex items-center gap-2 bg-white border border-slate-200 rounded-full px-3 py-1 text-sm">
                    <span className="font-semibold">{Math.min(5, enriched.length)}+</span>
                    <span className="text-slate-500">popular reads</span>
                  </div>
                </motion.div>
              </div>

              {/* Search + Filters */}
              <motion.aside variants={cardVariants} className="mt-6 md:mt-0 md:w-96 p-4 rounded-lg bg-white">
                <form onSubmit={(e) => e.preventDefault()} className="flex gap-2">
                  <label htmlFor="blog-search" className="sr-only">Search articles</label>
                  <input id="blog-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search: 'split', 'rent', 'budget'" className="flex-1 rounded-xl border border-slate-200 px-3 py-2" />
                  <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort articles" className="rounded-xl border border-slate-200 px-3 py-2">
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="featured">Featured</option>
                  </select>
                </form>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => setActiveTag(null)} className={`px-3 py-1 rounded-full text-sm ${!activeTag ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-700'}`} aria-pressed={!activeTag}>All</button>
                  {tags.map((t) => (
                    <button key={t} onClick={() => setActiveTag((s) => (s === t ? null : t))} className={`px-3 py-1 rounded-full text-sm ${activeTag === t ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-700'}`} aria-pressed={activeTag === t}>{t}</button>
                  ))}

                  <button onClick={clearFilters} className="ml-auto text-sm text-teal-600">Clear</button>
                </div>

                {/* Subscribe CTA compact */}
                {/* <div className="mt-4 border-t pt-4">
                  {subscribed ? (
                    <div className="text-sm text-teal-700">You're subscribed — thanks!</div>
                  ) : (
                    <form onSubmit={handleSubscribe} className="flex gap-2">
                      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@domain.com" className="flex-1 rounded-xl border border-slate-200 px-3 py-2" />
                      <button type="submit" disabled={submitting} className="rounded-xl bg-teal-600 text-white px-3 py-2">{submitting ? 'Saving...' : 'Subscribe'}</button>
                    </form>
                  )}
                  {successMsg && <div className="mt-2 text-sm text-slate-600">{successMsg}</div>}
                </div> */}
              </motion.aside>
            </div>
          </div>
        </motion.header>

        {/* Featured card */}
        {featured && (
          <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }} className="mb-8">
            <Link to={`/blogs/${featured.slug}`} className="block rounded-2xl overflow-hidden bg-gradient-to-r from-[#f8fafc] to-white border border-teal-100 shadow-sm hover:shadow-md transition">
              <div className="grid md:grid-cols-3">
                {featured.coverImage && <img src={featured.coverImage} alt={featured.title} className="w-full h-44 md:h-auto md:col-span-1 object-cover" loading="lazy" />}
                <div className="p-6 md:col-span-2">
                  <div className="text-sm text-teal-600 mb-1">Featured • {featured.dateDisplay}</div>
                  <h2 className="text-2xl font-semibold mb-2">{featured.title}</h2>
                  <p className="text-slate-700">{featured.excerpt}</p>
                </div>
              </div>
            </Link>
          </motion.section>
        )}

        {/* Post grid */}
        <motion.section initial="hidden" animate="show" variants={containerVariants}>
          <motion.div className="grid gap-6 md:grid-cols-2">
            {visible.map((p) => (
              <motion.article key={p.slug} variants={cardVariants} className="bg-white rounded-2xl p-4 shadow-sm hover:shadow-md cursor-pointer transition transform hover:-translate-y-1">
                <div className="flex gap-4">
                  {p.coverImage && (
                    <Link to={`/blogs/${p.slug}`} className="w-36 shrink-0 hidden md:block">
                      <img src={p.coverImage} alt={p.title} className="w-full h-24 object-cover rounded-md" loading="lazy" />
                    </Link>
                  )}

                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 text-sm text-slate-500">
                      <time>{p.dateDisplay}</time>
                      <span>•</span>
                      <span>{p.readingMinutes} min read</span>
                    </div>

                    <h3 className="text-lg font-semibold mb-1"><Link to={`/blogs/${p.slug}`} className="hover:underline text-slate-900">{p.title}</Link></h3>
                    <p className="text-slate-700 mb-3">{p.excerpt}</p>

                    <div className="flex items-center justify-between">
                      <div className="flex gap-2 items-center">
                        {(p.tags || []).slice(0, 3).map((t) => (
                          <button key={t} onClick={() => setActiveTag(t)} className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">{t}</button>
                        ))}
                      </div>

                      <Link to={`/blogs/${p.slug}`} className="text-teal-600 font-medium">Read →</Link>
                    </div>
                  </div>
                </div>
              </motion.article>
            ))}
          </motion.div>

          {/* no results */}
          {filtered.length === 0 && (
            <div className="mt-8 p-6 rounded-2xl bg-white text-center text-slate-700">No articles match your search — try different keywords or clear filters.</div>
          )}

          <div className="mt-8 flex justify-center">
            {canLoadMore ? (
              <button onClick={() => setPage((s) => s + 1)} className="px-6 py-3 rounded-2xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition">Load more</button>
            ) : (
              <div className="text-slate-500">You're all caught up ✨</div>
            )}
          </div>
        </motion.section>
      </main>

      <Footer />
    </div>
  );
}
