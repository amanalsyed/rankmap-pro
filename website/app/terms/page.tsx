import type { Metadata } from 'next';
import Link from 'next/link';
import { SEO, SITE } from '@/content/site';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: `Terms of Service for the ${SITE.name} Chrome extension, Lifetime licensing, and rankmappro.com.`,
  openGraph: {
    title: `Terms of Service | ${SITE.name}`,
    description: `Terms of Service for the ${SITE.name} Chrome extension and website.`,
    url: `${SITE.url}/terms`,
    type: 'website',
    images: [{ url: SEO.ogImage, width: SEO.ogImageWidth, height: SEO.ogImageHeight, alt: SEO.ogImageAlt }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `Terms of Service | ${SITE.name}`,
    description: `Terms of Service for the ${SITE.name} Chrome extension and website.`,
    images: [SEO.ogImage],
  },
  alternates: { canonical: `${SITE.url}/terms` },
};

export default function TermsPage() {
  return (
    <article className="legal-page">
      <div className="container legal-content">
        <h1>Terms of Service</h1>
        <p className="legal-meta">
          Last updated: September 8, 2026 · Contact:{' '}
          <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
        </p>

        <p>
          These Terms of Service (&quot;Terms&quot;) govern your use of RankMap Pro, including the
          Chrome extension, website at {SITE.domain}, and related services. By using RankMap Pro,
          you agree to these Terms.
        </p>

        <h2>Service description</h2>
        <p>
          RankMap Pro provides tools for local SEO professionals on Google Maps, including lead
          finding, GBP audits, rank checking, competitive scans, and data enrichment. Features and
          limits vary by subscription plan.
        </p>

        <h2>Accounts</h2>
        <ul>
          <li>You must provide accurate account information when signing up.</li>
          <li>You are responsible for maintaining the security of your account credentials.</li>
          <li>You must notify us promptly of any unauthorized access.</li>
        </ul>

        <h2>Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use RankMap Pro in violation of Google&apos;s Terms of Service or applicable laws</li>
          <li>Scrape, overload, or disrupt Google or third-party services</li>
          <li>Resell, sublicense, or redistribute the extension without permission</li>
          <li>Attempt to bypass plan limits, authentication, or security measures</li>
          <li>Use the service for spam, harassment, or unlawful outreach</li>
        </ul>

        <h2>Payments and license keys</h2>
        <ul>
          <li>
            The Free plan has no payment required and includes monthly usage limits.
          </li>
          <li>
            Lifetime is a one-time $19 launch payment (regular price $29) processed through Creem.io — no
            recurring subscription.
          </li>
          <li>
            After purchase, you receive a license key via email. Activate it in Settings → Account inside the extension to unlock unlimited access.
          </li>
          <li>
            Each license key can be transferred between devices. Contact {SITE.email} to deactivate from one device and move to another.
          </li>
          <li>
            Lifetime purchases include a 14-day money-back guarantee — no questions asked. Contact{' '}
            {SITE.email} within 14 days for a full refund. Other refunds are handled according to
            Creem.io&apos;s policies and applicable law.
          </li>
          <li>We may change pricing with reasonable notice. Existing license holders are not affected by price changes.</li>
        </ul>

        <h2>Free plan limits</h2>
        <p>
          The free plan includes monthly usage limits (lead scans, GBP audits, quick Local Scans,
          deep scan profiles, enrichment scans, and CSV exports). When limits are reached,
          features are restricted until the next billing period or until you upgrade to Lifetime.
        </p>

        <h2>Intellectual property</h2>
        <p>
          RankMap Pro, its branding, code, and documentation are owned by us. You receive a
          limited, non-exclusive license to use the extension for your own business purposes in
          accordance with these Terms.
        </p>

        <h2>Disclaimer</h2>
        <p>
          RankMap Pro is provided &quot;as is&quot; without warranties of any kind. We do not
          guarantee specific SEO results, ranking improvements, lead conversion, or data accuracy.
          Maps data and third-party listings may change without notice.
        </p>

        <h2>Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, RankMap Pro and its operators shall not be liable
          for indirect, incidental, special, or consequential damages arising from your use of the
          service. Our total liability shall not exceed the amount you paid us in the twelve months
          preceding the claim.
        </p>

        <h2>Termination</h2>
        <p>
          We may suspend or terminate access for violation of these Terms. You may stop using the
          service at any time by uninstalling the extension and cancelling your subscription.
        </p>

        <h2>Changes</h2>
        <p>
          We may modify these Terms at any time. Material changes will be reflected by updating the
          &quot;Last updated&quot; date. Continued use constitutes acceptance.
        </p>

        <h2>Governing law</h2>
        <p>
          These Terms are governed by applicable law in the jurisdiction of the service operator.
          Disputes should first be addressed by contacting {SITE.email}.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about these Terms? Email{' '}
          <a href={`mailto:${SITE.email}`}>{SITE.email}</a> or visit{' '}
          <Link href="/">{SITE.domain}</Link>. See also our{' '}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </article>
  );
}
