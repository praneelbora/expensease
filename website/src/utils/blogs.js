// src/data/blogs.js
// Single source of truth for all blog post metadata and lightweight helpers.
// Keep the contentPlain small here (used for reading time / excerpts).

export const BASE_URL = "https://www.expensease.in";

export const posts = [
  {
    slug: "tips-for-splitting-expenses",
    title: "5 Tips for Splitting Expenses with Friends",
    excerpt:
      "Practical, no-drama techniques to split bills fairly — equal splits, percentages, and simple rules everyone agrees on.",
    contentPlain:
      "Splitting expenses with friends can sometimes be awkward, but it doesn’t have to be. With the right approach and tools, you can avoid misunderstandings and keep things fair. Decide the split method upfront, use an app to track, record expenses immediately, review balances regularly, and settle periodically. Being clear about expectations early and using simple rules helps prevent friction in both small gatherings and extended group trips.",
    datePublished: "2025-08-20",
    dateDisplay: "August 20, 2025",
    author: "Expensease Editorial Team",
    tags: ["split expenses", "roommates", "travel"],
    featured: true,
  },
  {
    slug: "how-to-track-your-spending",
    title: "How to Track Your Spending Effectively",
    excerpt:
      "Simple systems to log expenses, categorize spending, and make a budget you’ll actually follow — no spreadsheets required.",
    contentPlain:
      "Tracking your spending is key to better financial health. Start by logging every expense, no matter how small, so nothing slips through. Organize transactions into categories like food, rent, travel, and entertainment to spot patterns easily. Review your spending weekly to understand where money leaks happen and adjust habits. Small habits compound into big wins, and with consistency, you’ll be able to build awareness and take control over your personal finances.",
    datePublished: "2025-08-15",
    dateDisplay: "August 15, 2025",
    author: "Expensease Editorial Team",
    tags: ["personal finance", "budgeting"],
    featured: false,
  },
  {
    slug: "why-group-expense-apps-matter",
    title: "Why Group Expense Apps Are a Game Changer",
    excerpt:
      "From trips to house shares — why dedicated apps beat spreadsheets and WhatsApp calculations every time.",
    contentPlain:
      "Group expense apps bring transparency and fairness to shared costs. They make sure everyone knows who paid what, who owes whom, and when settlements are due. With support for multiple currencies, built-in privacy, and clear settlement flows, apps simplify what would otherwise be stressful money conversations. Whether it’s for roommates, travel groups, or shared projects, dedicated expense tools prevent confusion and save relationships.",
    datePublished: "2025-08-10",
    dateDisplay: "August 10, 2025",
    author: "Expensease Editorial Team",
    tags: ["group expenses", "travel"],
    featured: false,
  },
  {
    slug: "splitwise-alternatives-2025",
    title: "Best Splitwise Alternatives in 2025",
    excerpt:
      "A candid comparison of modern apps that help you split group costs — features, pricing and who they're for.",
    contentPlain:
      "Looking for alternatives to Splitwise? We compare modern expense apps that offer simple splitting, group management, and privacy controls. Some focus on travel groups, others on roommates, and some are tailored for small teams. Picking the right tool depends on your needs: ease of use, support for multiple groups, or strong privacy settings. The best choice is the one that fits naturally into your lifestyle and reduces the friction of handling money with others.",
    datePublished: "2025-07-01",
    dateDisplay: "July 01, 2025",
    author: "Product Team",
    tags: ["splitwise alternatives", "comparisons", "apps"],
    featured: false,
  },
  {
    slug: "rent-splitting-guide",
    title: "How to Split Rent with Roommates (without drama)",
    excerpt:
      "Practical templates and rules to split rent, utilities and common bills so everything stays fair and predictable.",
    contentPlain:
      "When splitting rent, decide who pays which bills and how to account for differences in room sizes or amenities. Using percentages is a fair approach when rooms are unequal, while equal splits work well for similar setups. Centralizing the record of payments and utilities in a shared app reduces confusion and keeps everyone accountable. A clear system avoids arguments and ensures smooth co-living experiences.",
    datePublished: "2025-06-10",
    dateDisplay: "June 10, 2025",
    author: "Expensease Editorial Team",
    tags: ["roommates", "rent"],
    featured: false,
  },
  {
    slug: "travel-expenses-tips",
    title: "Travel Expense Hacks for Groups",
    excerpt:
      "Plan ahead, set expectations, and use the right tools — make group travel bookkeeping painless.",
    contentPlain:
      "During group trips, expenses can pile up quickly if they’re not organized. Rotate who pays for shared activities or meals so one person doesn’t carry the entire burden. Track receipts or note down amounts in an expense app to keep things transparent. Settle balances at checkpoints during the trip rather than waiting until the very end to prevent large outstanding amounts. These simple hacks ensure your focus stays on enjoying the trip instead of stressing over money.",
    datePublished: "2025-05-20",
    dateDisplay: "May 20, 2025",
    author: "Guest Author",
    tags: ["travel", "split expenses"],
    featured: false,
  },
];

// --- helpers ---
export function countWords(text = "") {
  return (text.match(/\w+/g) || []).length;
}

export function readingTimeFromText(text = "") {
  const words = countWords(text);
  return Math.max(1, Math.ceil(words / 200));
}

export function getEnrichedPosts() {
  return posts
    .map((p) => {
      const words = countWords(`${p.excerpt || ""} ${p.contentPlain || ""}`);
      return { ...p, words, readingMinutes: readingTimeFromText(`${p.excerpt || ""} ${p.contentPlain || ""}`) };
    })
    .sort((a, b) => new Date(b.datePublished) - new Date(a.datePublished));
}

export function getPostBySlug(slug) {
  const p = posts.find((x) => x.slug === slug);
  if (!p) return null;
  const words = countWords(`${p.excerpt || ""} ${p.contentPlain || ""}`);
  return { ...p, words, readingMinutes: readingTimeFromText(`${p.excerpt || ""} ${p.contentPlain || ""}`) };
}

export function getAllTags() {
  const s = new Set();
  posts.forEach((p) => (p.tags || []).forEach((t) => s.add(t)));
  return Array.from(s).sort();
}

export default posts;
