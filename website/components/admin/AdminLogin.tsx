'use client';

import { useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import styles from './AdminDashboard.module.css';

interface AdminLoginProps {
  busy: boolean;
  setBusy: (v: boolean) => void;
}

export default function AdminLogin({ busy, setBusy }: AdminLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const supabase = getSupabaseClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setError('Enter your email first, then click Forgot password.');
      return;
    }
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const supabase = getSupabaseClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/admin`,
      });
      if (resetError) throw resetError;
      setNotice('Password reset email sent. Check your inbox.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset email');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.loginBox}>
          <h1 className={styles.loginTitle}>RankMap Pro Admin</h1>
          <p className={styles.loginHint}>Sign in with your super-admin account.</p>
          <form onSubmit={handleSignIn}>
            <div className={styles.formGroup}>
              <label htmlFor="admin-email">Email</label>
              <input
                id="admin-email"
                className={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="admin-password">Password</label>
              <input
                id="admin-password"
                className={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className={styles.actions} style={{ marginBottom: 12 }}>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
              <button className="btn btn-secondary" type="button" disabled={busy} onClick={handleForgotPassword}>
                Forgot password
              </button>
            </div>
            {error && <p className={styles.error}>{error}</p>}
            {notice && <p className={styles.notice}>{notice}</p>}
          </form>
        </div>
      </div>
    </div>
  );
}
