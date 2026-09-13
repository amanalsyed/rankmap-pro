import { SUPABASE_URL } from './config';

export const GOOGLE_CLIENT_ID =
  '194915870247-e16p1n0pn252ac94sqa3ndeha8mfejuq.apps.googleusercontent.com';

export const GOOGLE_AUTH_CONFIGURED = Boolean(GOOGLE_CLIENT_ID);

export interface GoogleOAuthSetup {
  extensionId: string;
  /** Add to Supabase → Authentication → URL Configuration → Site URL + Redirect URLs. */
  supabaseRedirectUri: string;
  clientId: string;
  /** Add to Google Cloud → Web application client → Authorized redirect URIs. */
  googleCallbackUrl: string;
}

export function getGoogleOAuthSetup(): GoogleOAuthSetup {
  const supabaseHost = new URL(SUPABASE_URL).origin;

  return {
    extensionId: chrome.runtime.id,
    supabaseRedirectUri: chrome.identity.getRedirectURL(),
    clientId: GOOGLE_CLIENT_ID,
    googleCallbackUrl: `${supabaseHost}/auth/v1/callback`,
  };
}

export function formatGoogleAuthError(error: string, setup: GoogleOAuthSetup): string {
  const lower = error.toLowerCase();

  if (lower.includes('closed before completing')) {
    return 'The sign-in tab was closed before finishing. Click Sign in with Google and complete the flow in the tab that opens.';
  }

  if (lower.includes('timed out')) {
    return 'Sign-in timed out. Click Sign in with Google and finish the flow in the tab that opens.';
  }

  if (lower.includes('authorization page could not be loaded')) {
    return (
      'Chrome could not load the sign-in page. Reload the extension at chrome://extensions and try again.'
    );
  }

  if (lower.includes('nonce')) {
    return (
      `${error}\n\n` +
      'Enable "Skip nonce check" in Supabase → Authentication → Providers → Google, then try again.'
    );
  }

  if (lower.includes('redirect_uri_mismatch') || lower.includes('redirect_uri')) {
    return (
      'Redirect URI mismatch.\n\n' +
      'Google Cloud → Web application client → Authorized redirect URIs → add:\n' +
      `${setup.googleCallbackUrl}\n\n` +
      'Supabase → URL Configuration → Redirect URLs → add:\n' +
      `${setup.supabaseRedirectUri}`
    );
  }

  if (lower.includes('access_denied')) {
    return 'Google denied access. If your OAuth consent screen is in Testing mode, add your Google account as a test user.';
  }

  return error;
}
