'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { CHROME_STORE_URL, CREEM_CHECKOUT_URL, LIFETIME_PRICING, SITE } from '@/content/site';
import styles from './Navbar.module.css';

const LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#who-its-for', label: 'Who it\'s for' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
  { href: '#contact', label: 'Contact' },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Link href="/" className={styles.logo}>
          <Image src="/icons/icon.svg" alt="" width={36} height={36} className={styles.logoIcon} />
          <span>{SITE.name}</span>
        </Link>

        <nav className={styles.nav} aria-label="Main">
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} className={styles.navLink}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className={styles.actions}>
          <a
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`btn btn-secondary ${styles.install}`}
          >
            Install
          </a>
          <a
            href={CREEM_CHECKOUT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`btn btn-primary ${styles.cta}`}
          >
            Lifetime {LIFETIME_PRICING.priceLabel}
          </a>
          <button
            type="button"
            className={styles.menuBtn}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <span className={open ? styles.menuOpen : ''} />
          </button>
        </div>
      </div>

      {open ? (
        <nav className={styles.mobileNav} aria-label="Mobile">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={styles.mobileLink}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <a
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.mobileLink}
            onClick={() => setOpen(false)}
          >
            Install extension
          </a>
          <a
            href={CREEM_CHECKOUT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.mobileLink} ${styles.mobileCta}`}
            onClick={() => setOpen(false)}
          >
            Lifetime {LIFETIME_PRICING.priceLabel}
          </a>
        </nav>
      ) : null}
    </header>
  );
}
