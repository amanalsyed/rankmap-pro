'use client';

import { trackContactSubmit } from '@/lib/analytics';
import { FormEvent, useState } from 'react';
import SectionHeader from './SectionHeader';
import styles from './ContactForm.module.css';

type FormStatus = 'idle' | 'sending' | 'success' | 'error';

interface FormFields {
  name: string;
  phone: string;
  email: string;
  message: string;
}

const EMPTY_FORM: FormFields = {
  name: '',
  phone: '',
  email: '',
  message: '',
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateFields(fields: FormFields): string | null {
  const name = fields.name.trim();
  const email = fields.email.trim();
  const message = fields.message.trim();

  if (!name) return 'Please enter your name.';
  if (!email || !EMAIL_PATTERN.test(email)) return 'Please enter a valid email address.';
  if (!message) return 'Please enter a message.';
  return null;
}

export default function ContactForm() {
  const [fields, setFields] = useState<FormFields>(EMPTY_FORM);
  const [status, setStatus] = useState<FormStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const updateField = (key: keyof FormFields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    if (status === 'error') {
      setStatus('idle');
      setErrorMessage('');
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validationError = validateFields(fields);
    if (validationError) {
      setStatus('error');
      setErrorMessage(validationError);
      return;
    }

    setStatus('sending');
    setErrorMessage('');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });

      const payload = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setStatus('error');
        setErrorMessage(payload.error ?? 'Something went wrong. Please try again.');
        return;
      }

      setStatus('success');
      setFields(EMPTY_FORM);
      trackContactSubmit();
    } catch {
      setStatus('error');
      setErrorMessage('Could not send your message. Check your connection and try again.');
    }
  };

  return (
    <section id="contact" className={styles.section}>
      <div className="container">
        <SectionHeader
          label="Contact"
          title="Get in touch"
          subtitle="Questions about RankMap Pro, billing, or partnerships? Send us a message and we'll get back to you."
        />

        <div className={styles.card}>
          {status === 'success' ? (
            <div className={styles.successBanner} role="status">
              <strong>Message sent!</strong>
              <p>Thanks for reaching out. We'll reply to your email as soon as we can.</p>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStatus('idle')}
              >
                Send another message
              </button>
            </div>
          ) : (
            <form className={styles.form} onSubmit={(e) => void handleSubmit(e)} noValidate>
              <div className={styles.row}>
                <label className={styles.field}>
                  <span>Name</span>
                  <input
                    type="text"
                    name="name"
                    value={fields.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="Your name"
                    required
                    autoComplete="name"
                    disabled={status === 'sending'}
                  />
                </label>
                <label className={styles.field}>
                  <span>Phone</span>
                  <input
                    type="tel"
                    name="phone"
                    value={fields.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    placeholder="(555) 123-4567"
                    autoComplete="tel"
                    disabled={status === 'sending'}
                  />
                </label>
              </div>

              <label className={styles.field}>
                <span>Email</span>
                <input
                  type="email"
                  name="email"
                  value={fields.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="you@agency.com"
                  required
                  autoComplete="email"
                  disabled={status === 'sending'}
                />
              </label>

              <label className={styles.field}>
                <span>Message</span>
                <textarea
                  name="message"
                  value={fields.message}
                  onChange={(e) => updateField('message', e.target.value)}
                  placeholder="How can we help?"
                  rows={5}
                  required
                  disabled={status === 'sending'}
                />
              </label>

              {status === 'error' ? (
                <div className={styles.errorBanner} role="alert">
                  {errorMessage}
                </div>
              ) : null}

              <button type="submit" className={`btn btn-primary ${styles.submit}`} disabled={status === 'sending'}>
                {status === 'sending' ? 'Sending…' : 'Send message'}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
