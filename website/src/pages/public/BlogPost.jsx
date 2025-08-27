import React, { useMemo, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Share2, ArrowLeft, ArrowRight, Link as LinkIcon } from "lucide-react";
import SEO from "../../components/SEO";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";
import {
  getPostBySlug,
  getEnrichedPosts,
  BASE_URL,
  countWords,
  readingTimeFromText,
} from "../../utils/blogs";

// BlogPost — Improved
// - Uses single source (src/data/blogs.js)
// - Matches UI/UX (teal accents, rounded cards, Framer Motion)
// - Article + Breadcrumb JSON-LD, canonical, share, prev/next, related posts
// - Accessible controls and small animations

function buildArticleJsonLd(post, url) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    image: post.coverImage ? [post.coverImage] : undefined,
    datePublished: post.datePublished,
    dateModified: post.dateModified || post.datePublished,
    author: { "@type": "Person", name: post.author || "Expensease" },
    publisher: {
      "@type": "Organization",
      name: "Expensease",
      logo: { "@type": "ImageObject", url: `${BASE_URL}/image.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  };
}

function buildBreadcrumbJsonLd(url, title) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: BASE_URL },
      { "@type": "ListItem", position: 2, name: "Blogs", item: `${BASE_URL}/blogs` },
      { "@type": "ListItem", position: 3, name: title, item: url },
    ],
  };
}

export default function BlogPost() {
  const { slug } = useParams();
  const navigate = useNavigate();

  const post = useMemo(() => getPostBySlug(slug), [slug]);
  const all = useMemo(() => getEnrichedPosts(), []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [slug]);

  // 404 view if slug invalid
  if (!post) {
    const recent = all.slice(0, 3);
    return (
      <>
        <SEO title="Article not found | Expensease" description="Looks like we can't find that article." canonical={`${BASE_URL}/blogs`} />
        <NavBar />
        <main className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900 py-24 px-6">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-2xl font-semibold mb-2">Article not found</h1>
            <p className="text-slate-600 mb-6">We couldn't find the article you were looking for. Here are some recent posts you might enjoy.</p>

            <div className="grid gap-4">
              {recent.map((r) => (
                <Link key={r.slug} to={`/blogs/${r.slug}`} className="block p-4 rounded-2xl bg-white shadow-sm hover:shadow-md text-left">
                  <div className="text-sm text-teal-600 mb-1">{r.dateDisplay}</div>
                  <div className="font-semibold">{r.title}</div>
                  <div className="text-sm text-slate-600 mt-1">{r.excerpt}</div>
                </Link>
              ))}
            </div>

            <button onClick={() => navigate('/blogs')} className="mt-8 inline-flex items-center gap-2 text-teal-600 font-medium">← Back to blogs</button>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  // reading stats
  const words = countWords(`${post.excerpt || ""} ${post.contentPlain || ""}`);
  const minutes = readingTimeFromText(`${post.excerpt || ""} ${post.contentPlain || ""}`);

  // prev / next
  const sorted = all.sort((a, b) => new Date(b.datePublished) - new Date(a.datePublished));
  const idx = sorted.findIndex((p) => p.slug === post.slug);
  const prev = idx > 0 ? sorted[idx - 1] : null;
  const next = idx < sorted.length - 1 ? sorted[idx + 1] : null;

  // related by tag overlap
  const related = useMemo(() => {
    if (!post.tags || post.tags.length === 0) return [];
    const set = new Set(post.tags);
    return all
      .filter((p) => p.slug !== post.slug)
      .map((p) => ({ p, overlap: (p.tags || []).reduce((s, t) => s + (set.has(t) ? 1 : 0), 0) }))
      .filter((x) => x.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap || new Date(b.p.datePublished) - new Date(a.p.datePublished))
      .slice(0, 3)
      .map((x) => x.p);
  }, [post, all]);

  const canonical = `${BASE_URL}/blogs/${post.slug}`;
  const articleJsonLd = buildArticleJsonLd(post, canonical);
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(canonical, post.title);

  async function handleShare() {
    const url = canonical;
    const payload = { title: post.title, text: post.excerpt, url };
    try {
      if (navigator.share) {
        await navigator.share(payload);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        alert("Link copied to clipboard");
      } else {
        // fallback
        const tmp = document.createElement('input');
        document.body.appendChild(tmp);
        tmp.value = url;
        tmp.select();
        document.execCommand('copy');
        tmp.remove();
        alert('Link copied to clipboard');
      }
    } catch (e) {
      // noop
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900">
      <SEO title={`${post.title} | Expensease`} description={post.excerpt || post.contentPlain.slice(0, 160)} canonical={canonical} />

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <NavBar />

      <main className="max-w-4xl mx-auto px-6 py-16 mt-16">
        <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl p-8 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            <div className="md:flex-1">
              <h1 className="text-3xl md:text-4xl font-extrabold leading-tight">{post.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                <time dateTime={post.datePublished}>{post.dateDisplay}</time>
                <span>•</span>
                <span>{words} words</span>
                <span>•</span>
                <span>{minutes} min read</span>
              </div>

              {post.tags?.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {post.tags.map((t) => (
                    <Link key={t} to={`/blogs?tag=${encodeURIComponent(t)}`} className="px-2 py-1 rounded-full bg-teal-50 text-teal-700 text-sm">#{t}</Link>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex items-start gap-2">
              <button onClick={handleShare} aria-label="Share article" className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm bg-white hover:shadow">
                <Share2 size={16} /> Share
              </button>

              <Link to="/blogs" className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm bg-white hover:shadow">
                <LinkIcon size={16} /> Back
              </Link>
            </div>
          </div>
        </motion.header>

        {post.coverImage ? (
          <motion.figure initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 overflow-hidden rounded-2xl shadow">
            <img src={post.coverImage} alt={post.title} className="w-full h-64 object-cover" loading="lazy" />
          </motion.figure>
        ) : null}

        <motion.article initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-8 bg-white rounded-2xl p-8 shadow-sm prose max-w-none text-slate-800">
          {/* Render plain content as paragraphs. If later you add `contentHtml` or `content` (JSX) in blogs.js, switch to that. */}
          {post.contentPlain.split("\n\n").map((para, i) => (
            <p key={i}>{para}</p>
          ))}

          <div className="mt-8 flex items-center gap-3">
            <button onClick={handleShare} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 text-white px-4 py-2">Share</button>
            <Link to="/blogs" className="text-teal-600 hover:underline">← Back to blogs</Link>
          </div>
        </motion.article>

        {(prev || next) && (
          <nav className="mt-10 grid md:grid-cols-2 gap-4">
            {prev ? (
              <Link to={`/blogs/${prev.slug}`} className="block p-4 rounded-2xl bg-white shadow-sm hover:shadow-md">
                <div className="text-xs text-slate-500">Previous</div>
                <div className="font-semibold">{prev.title}</div>
              </Link>
            ) : <div />}

            {next ? (
              <Link to={`/blogs/${next.slug}`} className="block p-4 rounded-2xl bg-white shadow-sm hover:shadow-md text-right">
                <div className="text-xs text-slate-500">Next</div>
                <div className="font-semibold">{next.title}</div>
              </Link>
            ) : <div />}
          </nav>
        )}

        {related.length > 0 && (
          <section className="mt-12">
            <h3 className="text-xl font-semibold mb-4">Related posts</h3>
            <div className="grid gap-4 md:grid-cols-3">
              {related.map((r) => (
                <Link key={r.slug} to={`/blogs/${r.slug}`} className="block p-4 rounded-2xl bg-white shadow-sm hover:shadow-md">
                  <div className="text-sm text-teal-600 mb-1">{r.dateDisplay}</div>
                  <div className="font-semibold">{r.title}</div>
                  <p className="text-sm text-slate-600 mt-2">{r.excerpt}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
