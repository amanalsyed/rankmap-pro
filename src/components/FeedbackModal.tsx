import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import { submitFeedback, type FeedbackCategory } from '../supabase/feedback';
import Modal from './Modal';

const CATEGORIES: { id: FeedbackCategory; label: string }[] = [
  { id: 'bug', label: 'Bug report' },
  { id: 'feature', label: 'Feature request' },
  { id: 'general', label: 'General' },
];

interface FeedbackModalProps {
  onClose: () => void;
}

export default function FeedbackModal({ onClose }: FeedbackModalProps) {
  const { state, signedIn } = useAuth();
  const [category, setCategory] = useState<FeedbackCategory>('general');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (state.profile?.email && !email) {
      setEmail(state.profile.email);
    }
  }, [state.profile?.email, email]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const trimmedMessage = message.trim();
    if (trimmedMessage.length < 10) {
      setError('Please enter at least 10 characters.');
      return;
    }

    const trimmedEmail = email.trim();
    if (!signedIn && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setBusy(true);
    const result = await submitFeedback({
      category,
      message: trimmedMessage,
      email: trimmedEmail || undefined,
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.error ?? 'Could not send feedback.');
      return;
    }

    setDone(true);
  };

  return (
    <Modal title="Send feedback" onClose={onClose} closeDisabled={busy} titleId="feedback-title">
      {done ? (
        <div className="app-modal-body">
          <p className="feedback-success">
            Thanks — your feedback was sent. We read every message and use it to improve RankMap Pro.
          </p>
          <footer className="app-modal-footer">
            <button type="button" className="btn-primary" onClick={onClose}>
              Close
            </button>
          </footer>
        </div>
      ) : (
        <form className="app-modal-body" onSubmit={(event) => void handleSubmit(event)} noValidate>
          <fieldset className="modal-pill-group">
            <legend>Type</legend>
            <div className="modal-pill-options">
              {CATEGORIES.map((item) => (
                <label
                  key={item.id}
                  className={`modal-pill-option${category === item.id ? ' active' : ''}`}
                >
                  <input
                    type="radio"
                    name="feedback-category"
                    value={item.id}
                    checked={category === item.id}
                    onChange={() => setCategory(item.id)}
                    disabled={busy}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="account-field">
            <span>Message</span>
            <textarea
              className="feedback-textarea"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Describe the bug, feature idea, or feedback…"
              rows={5}
              maxLength={2000}
              disabled={busy}
              required
            />
            <small className="feedback-char-count">{message.trim().length} / 2000</small>
          </label>

          <label className="account-field">
            <span>Email {signedIn ? '(optional — reply address)' : ''}</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={busy}
              required={!signedIn}
            />
          </label>

          {error ? <p className="account-form-error">{error}</p> : null}

          <footer className="app-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Sending…' : 'Send feedback'}
            </button>
          </footer>
        </form>
      )}
    </Modal>
  );
}
