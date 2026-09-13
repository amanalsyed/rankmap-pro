import { defineManifest } from '@crxjs/vite-plugin';
import packageJson from './package.json';
import { PRODUCT_DESCRIPTION, PRODUCT_NAME } from './src/brand';
import { GOOGLE_CLIENT_ID } from './src/supabase/google-oauth-setup';

/** Google Search + Maps hosts (regional TLDs included). */
const GOOGLE_PAGE_MATCHES = [
  'https://www.google.com/*',
  'https://google.com/*',
  'https://www.google.co.uk/*',
  'https://www.google.ca/*',
  'https://www.google.com.au/*',
  'https://www.google.de/*',
  'https://www.google.fr/*',
  'https://www.google.es/*',
  'https://www.google.it/*',
  'https://www.google.co.in/*',
  'https://www.google.com.br/*',
  'https://www.google.com.mx/*',
];

export default defineManifest({
  manifest_version: 3,
  name: PRODUCT_NAME,
  version: packageJson.version,
  description: PRODUCT_DESCRIPTION,
  permissions: ['storage', 'tabs', 'scripting', 'downloads', 'notifications', 'identity'],
  host_permissions: [
    'https://www.google.com/*',
    'https://google.com/*',
    'https://*.google.com/*',
    'https://cloudflare-dns.com/*',
    'https://*.tile.openstreetmap.org/*',
    'https://*.supabase.co/*',
  ],
  action: {
    default_popup: 'src/popup/index.html',
    default_title: PRODUCT_NAME,
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['https://www.google.com/maps/*', ...GOOGLE_PAGE_MATCHES],
      js: ['src/content/maps-main-world.ts'],
      run_at: 'document_start',
      world: 'MAIN',
    },
    {
      matches: GOOGLE_PAGE_MATCHES,
      js: ['src/content/maps-scanner.ts'],
      run_at: 'document_idle',
    },
    {
      matches: GOOGLE_PAGE_MATCHES,
      js: ['src/content/maps-gbp-audit-button.ts'],
      run_at: 'document_idle',
    },
    {
      matches: ['https://www.google.com/maps/*'],
      js: ['src/content/maps-gbp-detail-categories.ts'],
      run_at: 'document_idle',
    },
    {
      matches: GOOGLE_PAGE_MATCHES,
      js: ['src/content/maps-local-scan-button.ts'],
      run_at: 'document_idle',
    },
    {
      matches: GOOGLE_PAGE_MATCHES,
      js: ['src/content/search-parser.ts'],
      run_at: 'document_idle',
    },
    {
      matches: GOOGLE_PAGE_MATCHES,
      js: ['src/content/search-place-viewer.ts'],
      run_at: 'document_idle',
    },
    {
      matches: [
        'https://www.google.com/search*',
        'https://google.com/search*',
        'https://www.google.co.uk/search*',
        'https://www.google.ca/search*',
        'https://www.google.com.au/search*',
        'https://www.google.de/search*',
        'https://www.google.fr/search*',
        'https://www.google.es/search*',
        'https://www.google.it/search*',
        'https://www.google.co.in/search*',
        'https://www.google.com.br/search*',
        'https://www.google.com.mx/search*',
      ],
      js: ['src/content/serp-enhancer.ts'],
      run_at: 'document_idle',
    },
  ],
  icons: {
    '16': 'public/icons/icon16.png',
    '48': 'public/icons/icon48.png',
    '128': 'public/icons/icon128.png',
  },
  oauth2: {
    client_id: GOOGLE_CLIENT_ID,
    scopes: ['openid', 'email', 'profile'],
  },
  content_security_policy: {
    // connect-src also governs the MV3 service worker, so the Maps ranking endpoint
    // must be listed here or rank checks are blocked before the request is sent.
    extension_pages:
      "script-src 'self'; object-src 'self'; img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.openstreetmap.org; connect-src 'self' https://www.google.com https://*.google.com https://cloudflare-dns.com https://*.tile.openstreetmap.org https://*.supabase.co wss://*.supabase.co;",
  },
});
