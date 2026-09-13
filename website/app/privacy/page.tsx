import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE } from '@/content/site';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `Privacy Policy for ${SITE.name} — how we collect, use, and protect your data.`,
};

export default function PrivacyPage() {
  return (
    <article className="legal-page">
      <div className="container legal-content">
        <h1>Privacy Policy</h1>
        <p className="legal-meta">
          Last updated: September 8, 2026 · Contact:{' '}
          <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
        </p>

        <p>
          RankMap Pro (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates the RankMap Pro
          Chrome extension and website at {SITE.domain}. This Privacy Policy explains how we
          collect, use, and protect information when you use our services.
        </p>

        <h2>Information we collect</h2>
        <ul>
          <li>
            <strong>Account information:</strong> When you sign in, we collect your email address
            and authentication identifiers through Supabase Auth (email/password or Google OAuth).
          </li>
          <li>
            <strong>Usage data:</strong> We track plan quotas and usage counters (e.g. scans,
            audits, rank checks) to enforce subscription limits and sync your account across
            sessions.
          </li>
          <li>
            <strong>Scan metadata:</strong> Search queries, locations, and scan results you
            generate may be stored to provide history, dashboards, and export features within the
            extension.
          </li>
          <li>
            <strong>Payment information:</strong> We do not store credit card numbers. Payments
            are processed by Creem.io. Creem receives payment details directly. We only store your license key after activation.
          </li>
          <li>
            <strong>Extension permissions:</strong> The extension requires access to Google Maps and
            related Google domains to perform scans, audits, and rank checks. Data is processed
            locally in your browser unless explicitly synced to your account.
          </li>
        </ul>

        <h2>How we use information</h2>
        <ul>
          <li>Authenticate you and maintain your account</li>
          <li>Enforce plan limits and provide paid features</li>
          <li>Sync scan history and settings across devices</li>
          <li>Validate and activate license keys through Creem.io</li>
          <li>Respond to support requests sent to {SITE.email}</li>
          <li>Improve reliability and fix bugs</li>
        </ul>

        <h2>Third-party services</h2>
        <ul>
          <li>
            <strong>Supabase</strong> — authentication, database, and serverless functions
          </li>
          <li>
            <strong>Google</strong> — OAuth sign-in and Maps page access required for extension
            functionality
          </li>
          <li>
            <strong>Creem.io</strong> — one-time payment processing and license key delivery
          </li>
          <li>
            <strong>Vercel</strong> — website hosting for {SITE.domain}
          </li>
        </ul>

        <h2>Data retention</h2>
        <p>
          We retain account and usage data while your account is active. You may request deletion of
          your account and associated data by emailing {SITE.email}. We may retain minimal records
          required for billing, legal compliance, or fraud prevention.
        </p>

        <h2>Security</h2>
        <p>
          We use industry-standard practices including HTTPS, authenticated API access, and
          server-side validation. No method of transmission over the Internet is 100% secure, and
          we cannot guarantee absolute security.
        </p>

        <h2>Your rights</h2>
        <p>
          Depending on your location, you may have rights to access, correct, or delete your
          personal data. Contact us at {SITE.email} to exercise these rights.
        </p>

        <h2>Children</h2>
        <p>
          RankMap Pro is not intended for users under 16. We do not knowingly collect data from
          children.
        </p>

        <h2>Changes</h2>
        <p>
          We may update this policy from time to time. Continued use after changes constitutes
          acceptance. The &quot;Last updated&quot; date above reflects the latest revision.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy? Email{' '}
          <a href={`mailto:${SITE.email}`}>{SITE.email}</a> or visit{' '}
          <Link href="/">{SITE.domain}</Link>.
        </p>
      </div>
    </article>
  );
}
