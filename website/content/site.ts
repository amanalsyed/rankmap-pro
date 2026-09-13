export const SITE = {
  name: 'RankMap Pro',
  domain: 'rankmappro.com',
  url: 'https://rankmappro.com',
  email: 'rankmappro@gmail.com',
  tagline:
    'A Chrome extension that adds lead finding, GBP audits, rank checking, and competitive scans directly into Google Maps.',
  description:
    'Chrome extension for local SEO on Google Maps — find no-website leads, audit GBPs, check rankings, run competitive scans, and export reports.',
  heroTitle: 'Find local businesses with no website',
  heroAccent: 'on Google Maps',
  heroSubtitle:
    'RankMap Pro is a Chrome extension for local SEO on Maps. Find no-website leads, run quick and deep competitive scans, audit GBPs, enrich contacts, check pin-point rankings, and export reports — without leaving the map.',
  moneyBackGuarantee: '14-day money-back guarantee — no questions asked.',
} as const;

export const FEATURE_GROUPS = [
  {
    id: 'lead-finder',
    title: 'Lead Finder',
    icon: '🎯',
    accent: '#4f46e5',
    summary:
      'Scan Google Maps by niche and city to find local businesses with no website on their GBP — your best prospects for web design and SEO outreach.',
    items: [
      'Scan by niche + location — up to 50 results per scan (Free), 999 on Lifetime',
      '1 lead scan / month on Free · unlimited on Lifetime',
      'Live progress: checked count, no-website count, enrichment status',
      'Pause, resume, and stop scans from popup or Results page',
      'Multi-city batch on Lifetime only — up to 99 cities per run (single-city on Free)',
      'Automatic session saving with smart names like "Miami plumbers – Mar 2026"',
      'Captures each lead\'s Maps search rank and listing details',
      'Website detection opens listing panels to verify GBP website links',
    ],
  },
  {
    id: 'opportunity',
    title: 'Opportunity Score',
    icon: '🔥',
    accent: '#6366f1',
    summary:
      'Every lead gets a 0–100 opportunity score so you know who to call first — ranked by visibility, GBP gaps, contact data, and reviews.',
    items: [
      '0–100 score from Maps rank, GBP optimization gap, contacts, and reputation',
      'Hot / Warm / Cool tier badges for outreach prioritization',
      'Sort by opportunity, rank, GBP score, reviews, or name',
      'Filters: has email, has owner, top-10 rank, GBP below threshold',
      'Plain-language tooltips explaining why each lead is a hot prospect',
    ],
  },
  {
    id: 'enrichment',
    title: 'Contact Enrichment',
    icon: '⚡',
    accent: '#059669',
    summary:
      'Automatically find emails, social profiles, owners, and directory listings during scans or after audits — with MX-validated email confidence.',
    items: [
      'During-scan enrichment on Free (1 scan/month) · unlimited on Lifetime',
      'Post-audit enrichment for any business, including those with websites (Lifetime only)',
      'Social: Facebook, Instagram, LinkedIn, Twitter/X, TikTok',
      'Directories: Yelp, Yellow Pages, BBB, Angi, Thumbtack, Manta, Foursquare, MapQuest',
      'Owner name, title, and LinkedIn when available',
      'Email validation with Verified / Likely / Uncertain confidence levels',
      'Configurable search delay and concurrent tab limits',
    ],
  },
  {
    id: 'gbp-audit',
    title: 'GBP Audit',
    icon: '📋',
    accent: '#7c3aed',
    summary:
      'One-click Google Business Profile audits with a 0–100 optimization score, actionable findings, and client-ready PDF exports.',
    items: [
      'GMB Audit button on every Maps listing and search result card',
      '2 GBP audits / month on Free · unlimited on Lifetime',
      'Standalone audits without running a lead scan first',
      'Scores website, categories, hours, photos, posts, reviews, attributes, and more',
      'Critical / needs improvement / good findings breakdown',
      'Audit queue — run multiple audits with progress tracking and notifications',
      'Stale audit warnings with one-click refresh',
      'SEO toolkit links: PageSpeed, Rich Results, WHOIS, BuiltWith, Wayback, and more',
      'Export PDF, CSV, JSON, or print-ready reports',
      'White-label audit PDFs with your agency logo and contact info (Lifetime only)',
    ],
  },
  {
    id: 'rank-check',
    title: 'Rank Check',
    icon: '📍',
    accent: '#4338ca',
    summary:
      'Drop pins on an interactive map and see exactly where a business ranks for any keyword at each location — with competitor breakdowns.',
    items: [
      'Check Rank button pre-fills business from any Maps listing',
      'Interactive OpenStreetMap with draggable pin placement',
      '1 rank-check pin on Free · up to 99 pins on Lifetime',
      'One-click 3×3 grid generator with 2 km spacing around the business',
      'Color-coded rank badges: green top 3, yellow 4–10, red 11+',
      'Competitor list per pin with rating, reviews, and address',
      'Average rank summary across all pins with distance from target',
    ],
  },
  {
    id: 'local-scan',
    title: 'Local Scan',
    icon: '🔍',
    accent: '#4f46e5',
    summary:
      'Competitive intelligence from Maps search results — quick card-level scans or deep full-profile scrapes with 10 report tabs.',
    items: [
      'Sticky scan bar at the top of Maps search results',
      'Quick Scan — 2/month on Free · unlimited on Lifetime',
      'Deep Scan — 1 profile/month on Free · unlimited on Lifetime',
      'Partial deep scan when quota is low — uses remaining profiles and skips the rest',
      'Report tabs: Overview, Categories, Reviews, Location map, Search 3-pack, Compare',
      'Deep-only tabs: Services, Hours, Attributes, Profile features matrix',
      'Side-by-side compare of two Local Scan sessions with rank deltas',
      'SAB (Service Area Business) markers and distance-from-center analysis',
      'Export CSV, JSON, or PDF; Local Scan history saved on Lifetime',
    ],
  },
  {
    id: 'results',
    title: 'Results & Export',
    icon: '📊',
    accent: '#6366f1',
    summary:
      'Full-page results table with 15+ enrichment columns, smart filters, and CSV export for your entire pipeline.',
    items: [
      'Dedicated Results tab with sortable table and live scan progress',
      'Opportunity score, rank, GBP score, and all enrichment columns',
      'Export leads CSV with emails, socials, directories, owner, and audit data',
      '1 CSV export / month on Free · unlimited on Lifetime',
      'Shift+click to queue GBP audit and auto-open report when done',
      'Compare two lead scans from History on Lifetime (overlap, scores, top-10 stats)',
    ],
  },
  {
    id: 'workflow',
    title: 'Dashboard & Agency Tools',
    icon: '🏢',
    accent: '#312e81',
    summary:
      'Dashboard, history, account sync, white-label branding, and billing — everything an agency needs to run volume outreach.',
    items: [
      'Dashboard with stats, recent scans, quick actions, and audit queue bar',
      'Persistent History for lead scans and Local Scans on Lifetime (Free clears when browser closes)',
      'Activate a Lifetime license key in Settings → Account to unlock unlimited usage',
      'White-label settings on Lifetime: logo, agency name, tagline, contact details',
      'Usage bars for scans, audits, quick scans, deep profiles, enrichment, and CSV exports',
      'Works on Google Maps across US, UK, CA, AU, DE, FR, ES, IT, IN, BR, MX',
    ],
  },
] as const;

/** @deprecated Use FEATURE_GROUPS */
export const FEATURES = FEATURE_GROUPS.map((g) => ({
  id: g.id,
  title: g.title,
  headline: g.title,
  description: g.summary,
  icon: g.icon,
  accent: g.accent,
}));

export const STEPS = [
  {
    step: '01',
    title: 'Install the extension',
    description: 'Add RankMap Pro to Chrome. Start free with monthly limits, or purchase a lifetime license key for unlimited access — just enter your key to activate.',
  },
  {
    step: '02',
    title: 'Open Google Maps',
    description: 'Search any niche and city. RankMap Pro lives right on Maps — no tab switching, no copy-paste.',
  },
  {
    step: '03',
    title: 'Scan, audit, rank-check',
    description: 'Find leads, audit GBPs, check rankings, and export results — all from the map you already use.',
  },
] as const;

export const AUDIENCES = [
  {
    id: 'web-agencies',
    title: 'Web design & dev shops',
    icon: '🎨',
    accent: '#4f46e5',
    description:
      'Find local businesses with no website on their Google Business Profile — your warmest prospects for a new site build.',
    bullets: ['No-website lead scans by niche + city', 'Opportunity scores to prioritize outreach', 'Export emails & contacts to CSV'],
  },
  {
    id: 'seo-agencies',
    title: 'Local SEO agencies',
    icon: '📈',
    accent: '#7c3aed',
    description:
      'Run GBP audits, pin-grid rank checks, and competitive Local Scans without juggling a dozen separate tools.',
    bullets: ['One-click GBP audits with 0–100 scores', 'Multi-pin rank tracking across a city', 'White-label audit PDFs on Lifetime'],
  },
  {
    id: 'freelancers',
    title: 'Freelancers & consultants',
    icon: '💼',
    accent: '#059669',
    description:
      'Prospect and deliver from the same tab you already use — no expensive subscriptions or steep learning curves.',
    bullets: ['Start free with monthly limits', 'Lifetime pay-once pricing ($19 launch)', 'Works directly on Google Maps'],
  },
  {
    id: 'outreach',
    title: 'Lead gen & outreach teams',
    icon: '📞',
    accent: '#4338ca',
    description:
      'Build targeted lists with enrichment baked in — emails, socials, directories, and owner names on every lead.',
    bullets: ['Contact enrichment during scans', 'Batch multi-city runs on Lifetime', 'Sort, filter, and export full pipelines'],
  },
] as const;

export const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    period: 'forever',
    description: 'Try core tools with monthly limits.',
    features: [
      '1 lead scan / month',
      '2 GBP audits / month',
      '2 quick Local Scans / month',
      '1 deep scan profile / month',
      'Single-city scans (up to 50 results)',
      'Enrichment on 1 scan / month',
      '1 CSV export / month',
      '1 rank-check pin',
    ],
    cta: 'Install free',
    highlighted: false,
  },
  {
    id: 'lifetime',
    name: 'Lifetime',
    price: 19,
    priceLabel: '$19',
    compareAtPrice: 29,
    period: 'one-time',
    limitedTime: true,
    description: 'Launch price — every feature, unlimited. Pay once, use forever. Regular price $29.',
    features: [
      'Unlimited lead scans, GBP audits & deep profiles',
      'Unlimited quick Local Scans & CSV exports',
      'Batch scan up to 99 cities (999 results per scan)',
      'Full enrichment on every scan + post-audit enrichment',
      '99-pin rank check',
      'White-label audit PDFs with your branding',
    ],
    cta: 'Get Lifetime Access',
    highlighted: true,
  },
] as const;

export const FAQ = [
  {
    q: 'Does RankMap Pro work on Google Maps?',
    a: 'Yes. RankMap Pro runs directly on Google Maps and Google Search results pages. Install the extension, open Maps, and use the built-in tools from any listing or search.',
  },
  {
    q: 'Is there a free plan?',
    a: 'Yes. The free plan includes 1 lead scan, 2 GBP audits, 2 quick Local Scans, and 1 deep scan profile per month, plus single-city scans up to 50 results. Upgrade to Lifetime for unlimited access — purchase a license key and activate it in Settings → Account.',
  },
  {
    q: 'How do I upgrade to Lifetime?',
    a: 'Purchase a Lifetime license key from our website. After payment, you\'ll receive a license key via email. Open the extension, go to Settings → Account, enter your license key, and click Activate. Payments are processed securely by Creem.io. No subscriptions — pay once, use forever.',
  },
  {
    q: 'What data does RankMap Pro collect?',
    a: 'We store your account email, plan usage quotas, and scan metadata to sync your work across sessions. See our Privacy Policy for full details.',
  },
  {
    q: 'Can I white-label audit PDFs?',
    a: 'Lifetime includes white-label audit PDFs — add your agency logo, name, and contact info to exported GBP reports. Perfect for client deliverables.',
  },
  {
    q: 'What is the Lifetime plan?',
    a: 'Lifetime is a one-time $19 launch payment (regular price $29) for unlimited scans, audits, deep profiles, quick scans, CSV exports, white-label PDFs, and all premium features — with no recurring subscription. Pay once, use forever.',
  },
  {
    q: 'Is there a money-back guarantee?',
    a: 'Yes. Lifetime purchases include a 14-day money-back guarantee — no questions asked. Email rankmappro@gmail.com within 14 days of purchase for a full refund.',
  },
  {
    q: 'How do license keys work?',
    a: 'After purchasing Lifetime access, you\'ll receive a license key via email (format: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX). Enter this key in Settings → Account inside the extension to activate unlimited access. Your account is automatically created when you activate your first license.',
  },
  {
    q: 'Do I need to create an account?',
    a: 'No manual sign-up required! When you activate your license key for the first time, an account is automatically created and linked to your license. Just enter your key and you\'re ready to go.',
  },
  {
    q: 'Can I use my license on multiple devices?',
    a: 'Yes. Each license can be transferred between devices. If you switch computers, simply enter your license key in the new installation to activate it. You can deactivate from your old device and reactivate on a new one anytime.',
  },
  {
    q: 'What if I lose my license key?',
    a: 'Contact support at rankmappro@gmail.com with your purchase email, and we\'ll help you recover your license key.',
  },
] as const;

export const CHROME_STORE_URL = '#install';
