import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    rollupOptions: {
      input: {
        popup: 'src/popup/index.html',
        results: 'src/results/index.html',
        audit: 'src/audit/index.html',
        settings: 'src/settings/index.html',
        history: 'src/history/index.html',
        localScan: 'src/local-scan/index.html',
        rankCheck: 'src/rank-check/index.html',
        dashboard: 'src/dashboard/index.html',
        billingSuccess: 'src/billing/success.html',
        billingCancel: 'src/billing/cancel.html',
      },
    },
  },
});
