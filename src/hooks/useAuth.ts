import { useCallback, useEffect, useRef, useState } from 'react';
import { signInWithGoogle as runGoogleSignIn } from '../supabase/google-auth';
import {
  signInWithEmail as runEmailSignIn,
  signUpWithEmail as runEmailSignUp,
} from '../supabase/auth';
import type { CachedUserState } from '../supabase/types';
import { emptyCachedUserState } from '../supabase/types';

const USER_STATE_STORAGE_KEY = 'nwf_user_state';

interface SupabaseStatus {
  configured: boolean;
  googleConfigured: boolean;
}

export type SignUpResult = 'signed_in' | 'needs_confirmation' | false;

/** Turns Supabase's terse auth errors into something actionable for the user. */
function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('invalid login credentials')) {
    return 'Incorrect email or password. If you just signed up, confirm your email first.';
  }
  if (lower.includes('email not confirmed')) {
    return 'This email is not confirmed yet. Open the confirmation link we emailed you, then sign in.';
  }
  if (lower.includes('already registered') || lower.includes('already been registered')) {
    return 'An account with this email already exists. Switch to Sign in instead.';
  }
  if (lower.includes('password should be at least')) {
    return message;
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Too many attempts. Wait a minute and try again.';
  }

  return message;
}

async function fetchCachedState(): Promise<CachedUserState> {
  const res = (await chrome.runtime.sendMessage({ type: 'AUTH_GET_STATE' })) as {
    ok?: boolean;
    state?: CachedUserState;
  };
  return res?.state ?? emptyCachedUserState();
}

export function useAuth() {
  const [state, setState] = useState<CachedUserState>(emptyCachedUserState());
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState<SupabaseStatus>({ configured: false, googleConfigured: false });
  const skipStorageRefreshRef = useRef(false);

  const applyState = useCallback((next: CachedUserState) => {
    setState(next);
  }, []);

  const refresh = useCallback(async (fromCache = false) => {
    if (!fromCache) {
      setLoading(true);
    }
    try {
      const [stateRes, statusRes] = await Promise.all([
        chrome.runtime.sendMessage({
          type: fromCache ? 'AUTH_GET_STATE' : 'AUTH_REFRESH_STATE',
        }) as Promise<{
          ok?: boolean;
          state?: CachedUserState;
        }>,
        fromCache
          ? Promise.resolve(null)
          : (chrome.runtime.sendMessage({ type: 'GET_SUPABASE_STATUS' }) as Promise<{
              ok?: boolean;
              configured?: boolean;
              googleConfigured?: boolean;
            }>),
      ]);

      applyState(stateRes?.state ?? emptyCachedUserState());
      if (statusRes) {
        setStatus({
          configured: statusRes.configured === true,
          googleConfigured: statusRes.googleConfigured === true,
        });
      }
    } finally {
      if (!fromCache) {
        setLoading(false);
      }
    }
  }, [applyState]);

  const syncFromCache = useCallback(async () => {
    applyState(await fetchCachedState());
  }, [applyState]);

  useEffect(() => {
    void refresh(false);

    const onMessage = (message: { type?: string; state?: CachedUserState }) => {
      if (message.type !== 'USER_STATE_UPDATE' || !message.state) return;
      skipStorageRefreshRef.current = true;
      applyState(message.state);
      window.setTimeout(() => {
        skipStorageRefreshRef.current = false;
      }, 0);
    };

    const onStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== 'local' || !(USER_STATE_STORAGE_KEY in changes)) return;
      if (skipStorageRefreshRef.current) return;
      void syncFromCache();
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refresh(false);
      }
    };

    chrome.runtime.onMessage.addListener(onMessage);
    chrome.storage.onChanged.addListener(onStorageChange);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.storage.onChanged.removeListener(onStorageChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, applyState, syncFromCache]);

  const signInWithGoogle = useCallback(async () => {
    setSigningIn(true);
    setError('');
    try {
      const { user, error: signInError } = await runGoogleSignIn();

      if (signInError || !user) {
        setError(signInError ?? 'Google sign-in failed');
        return false;
      }

      await syncFromCache();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
      return false;
    } finally {
      setSigningIn(false);
    }
  }, [syncFromCache]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      setSigningIn(true);
      setError('');
      setNotice('');
      try {
        const { user, error: signInError } = await runEmailSignIn(email.trim(), password);

        if (signInError || !user) {
          setError(friendlyAuthError(signInError?.message ?? 'Sign in failed'));
          return false;
        }

        await syncFromCache();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sign in failed');
        return false;
      } finally {
        setSigningIn(false);
      }
    },
    [syncFromCache]
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string): Promise<SignUpResult> => {
      setSigningIn(true);
      setError('');
      setNotice('');
      try {
        const {
          user,
          error: signUpError,
          needsConfirmation,
        } = await runEmailSignUp(email.trim(), password);

        if (signUpError || !user) {
          setError(friendlyAuthError(signUpError?.message ?? 'Sign up failed'));
          return false;
        }

        if (needsConfirmation) {
          setNotice(
            `Account created. Check ${email.trim()} for a confirmation link, then sign in.`
          );
          return 'needs_confirmation';
        }

        await syncFromCache();
        return 'signed_in';
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sign up failed');
        return false;
      } finally {
        setSigningIn(false);
      }
    },
    [syncFromCache]
  );

  const signOut = useCallback(async () => {
    setSigningOut(true);
    setError('');
    setNotice('');
    try {
      const res = (await chrome.runtime.sendMessage({ type: 'AUTH_SIGN_OUT' })) as {
        ok?: boolean;
        error?: string;
      };

      if (!res?.ok || res.error) {
        setError(res?.error ?? 'Sign out failed');
        return false;
      }

      applyState(emptyCachedUserState());
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign out failed');
      return false;
    } finally {
      setSigningOut(false);
    }
  }, [applyState]);

  const signedIn = Boolean(
    state.profile &&
      (state.profile.email ||
        (state.profile.plan === 'lifetime' && state.profile.license_key))
  );

  const isSuperAdmin = Boolean(state.profile?.is_super_admin);

  return {
    state,
    loading,
    signingIn,
    signingOut,
    error,
    notice,
    status,
    signedIn,
    isSuperAdmin,
    refresh,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    clearError: () => {
      setError('');
      setNotice('');
    },
  };
}
