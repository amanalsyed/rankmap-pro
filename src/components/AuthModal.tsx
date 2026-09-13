import { useState, type FormEvent } from 'react';
import type { SignUpResult } from '../hooks/useAuth';
import Modal from './Modal';

/** Supabase's default minimum; keep in sync with Auth → Providers → Email. */
const MIN_PASSWORD_LENGTH = 6;

export type AuthMode = 'signin' | 'signup';

interface AuthModalProps {
  initialMode?: AuthMode;
  /** When false, hides Create account — use in the extension popup. */
  allowSignUp?: boolean;
  onClose: () => void;
  signingIn: boolean;
  error: string;
  notice: string;
  googleConfigured: boolean;
  signInWithGoogle: () => Promise<boolean>;
  signInWithEmail: (email: string, password: string) => Promise<boolean>;
  signUpWithEmail: (email: string, password: string) => Promise<SignUpResult>;
  clearError: () => void;
}

const MODES: { id: AuthMode; label: string }[] = [
  { id: 'signin', label: 'Sign in' },
  { id: 'signup', label: 'Create account' },
];

export default function AuthModal({
  initialMode = 'signin',
  allowSignUp = true,
  onClose,
  signingIn,
  error,
  notice,
  googleConfigured,
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  clearError,
}: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState('');

  const isSignUp = mode === 'signup';
  const busy = signingIn;

  const switchMode = (next: AuthMode) => {
    clearError();
    setFormError('');
    setPassword('');
    setConfirmPassword('');
    setMode(next);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    clearError();

    const trimmedEmail = email.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setFormError('Enter a valid email address.');
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setFormError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (isSignUp && password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    if (isSignUp) {
      const result = await signUpWithEmail(trimmedEmail, password);
      if (result === 'signed_in') {
        setPassword('');
        setConfirmPassword('');
        onClose();
      } else if (result === 'needs_confirmation') {
        setPassword('');
        setConfirmPassword('');
      }
      return;
    }

    const ok = await signInWithEmail(trimmedEmail, password);
    if (ok) {
      setPassword('');
      setConfirmPassword('');
      onClose();
    }
  };

  const handleGoogleSignIn = async () => {
    clearError();
    setFormError('');
    const ok = await signInWithGoogle();
    if (ok) {
      onClose();
    }
  };

  const displayError = formError || error;
  const title = isSignUp ? 'Create account' : 'Sign in';

  return (
    <Modal title={title} onClose={onClose} closeDisabled={busy} titleId="auth-modal-title">
      <form className="app-modal-body" onSubmit={(event) => void handleSubmit(event)} noValidate>
        {allowSignUp ? (
          <fieldset className="modal-pill-group">
            <legend className="sr-only">Account action</legend>
            <div className="modal-pill-options">
              {MODES.map((item) => (
                <label
                  key={item.id}
                  className={`modal-pill-option${mode === item.id ? ' active' : ''}`}
                >
                  <input
                    type="radio"
                    name="auth-mode"
                    value={item.id}
                    checked={mode === item.id}
                    onChange={() => switchMode(item.id)}
                    disabled={busy}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <p className="auth-modal-hint">
          {isSignUp
            ? 'Create a free account to sync your plan and usage across devices.'
            : 'Sign in to access your plan, usage limits, and saved settings.'}
        </p>

        <label className="account-field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="username"
            disabled={busy}
            required
          />
        </label>

        <label className="account-field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={isSignUp ? `At least ${MIN_PASSWORD_LENGTH} characters` : 'Your password'}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            disabled={busy}
            required
          />
        </label>

        {isSignUp ? (
          <label className="account-field">
            <span>Confirm password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Re-enter your password"
              autoComplete="new-password"
              disabled={busy}
              required
            />
          </label>
        ) : null}

        {displayError ? <p className="account-form-error settings-error">{displayError}</p> : null}
        {notice ? <p className="account-notice">{notice}</p> : null}

        <footer className="app-modal-footer app-modal-footer-stack">
          <button type="submit" className="btn-primary app-modal-submit" disabled={busy}>
            {busy
              ? isSignUp
                ? 'Creating account…'
                : 'Signing in…'
              : isSignUp
                ? 'Create account'
                : 'Sign in'}
          </button>

          {googleConfigured ? (
            <>
              <div className="account-divider">
                <span>or</span>
              </div>

              <button
                type="button"
                className="btn-google app-modal-google"
                onClick={() => void handleGoogleSignIn()}
                disabled={busy}
              >
                <span className="btn-google-icon" aria-hidden="true">
                  G
                </span>
                {busy ? 'Signing in…' : 'Continue with Google'}
              </button>
            </>
          ) : null}

          <button type="button" className="btn-secondary app-modal-cancel" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </footer>
      </form>
    </Modal>
  );
}
