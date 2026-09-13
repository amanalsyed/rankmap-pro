/**
 * Google sign-in for Chrome extensions — Supabase OAuth (PKCE) driven through a
 * real browser tab instead of chrome.identity.launchWebAuthFlow.
 *
 * Why not launchWebAuthFlow:
 * - It relies on Chrome intercepting the redirect to https://<id>.chromiumapp.org.
 *   When that interception does not happen, the browser tries to actually resolve
 *   chromiumapp.org (a domain that does not exist), DNS fails, and Chrome reports
 *   "Authorization page could not be loaded" — regardless of Supabase/Google config.
 * - Google also treats its auth window as an embedded view in some cases.
 *
 * Instead we open the OAuth URL in a normal tab and watch that tab's URL. As soon
 * as it navigates to the chromiumapp.org redirect we grab the ?code= and close the
 * tab. We never need the redirect page to actually load.
 *
 * Why PKCE: Google deprecated the implicit (id_token) flow — it returns an empty
 * response. PKCE returns ?code= in the query string, which survives cleanly.
 */

import { getSupabase, isSupabaseConfigured } from './client';
import { refreshUserState } from './auth';
import { formatGoogleAuthError, getGoogleOAuthSetup, GOOGLE_CLIENT_ID } from './google-oauth-setup';
import type { User } from '@supabase/supabase-js';

export { GOOGLE_CLIENT_ID, GOOGLE_AUTH_CONFIGURED } from './google-oauth-setup';

/** Chrome's virtual redirect target, e.g. https://<extension-id>.chromiumapp.org/ */
function getExtensionRedirectUri(): string {
  return chrome.identity.getRedirectURL();
}

const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Opens `url` in a tab and resolves with the first URL that starts with
 * `redirectPrefix`. Works even though that URL can never finish loading.
 */
function launchAuthFlowInTab(url: string, redirectPrefix: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url, active: true }, (tab) => {
      if (chrome.runtime.lastError || !tab?.id) {
        reject(new Error(chrome.runtime.lastError?.message ?? 'Could not open the sign-in tab'));
        return;
      }

      const tabId = tab.id;
      let settled = false;

      const cleanup = () => {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.onRemoved.removeListener(onRemoved);
        clearInterval(poll);
        clearTimeout(timeout);
      };

      const succeed = (redirectedUrl: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        chrome.tabs.remove(tabId, () => void chrome.runtime.lastError);
        resolve(redirectedUrl);
      };

      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(message));
      };

      /** The redirect URL may appear as url or pendingUrl, depending on load state. */
      const check = (candidate?: string | null) => {
        if (candidate && candidate.startsWith(redirectPrefix)) {
          succeed(candidate);
          return true;
        }
        return false;
      };

      const onUpdated = (
        updatedTabId: number,
        changeInfo: chrome.tabs.TabChangeInfo,
        updatedTab: chrome.tabs.Tab
      ) => {
        if (updatedTabId !== tabId) return;
        if (check(changeInfo.url)) return;
        check(updatedTab?.url ?? updatedTab?.pendingUrl);
      };

      const onRemoved = (removedTabId: number) => {
        if (removedTabId !== tabId) return;
        fail('Sign-in tab was closed before completing');
      };

      // Chrome does not always fire onUpdated for a navigation that fails to load,
      // so poll the tab URL as well.
      const poll = setInterval(() => {
        chrome.tabs.get(tabId, (current) => {
          if (chrome.runtime.lastError) return;
          check(current?.url ?? current?.pendingUrl);
        });
      }, 400);

      const timeout = setTimeout(() => fail('Sign-in timed out'), AUTH_TIMEOUT_MS);

      chrome.tabs.onUpdated.addListener(onUpdated);
      chrome.tabs.onRemoved.addListener(onRemoved);
    });
  });
}

function parseAuthCode(responseUrl: string): { code: string | null; error: string | null } {
  const url = new URL(responseUrl);
  const queryError = url.searchParams.get('error') ?? url.searchParams.get('error_code');
  if (queryError) {
    return { code: null, error: url.searchParams.get('error_description') ?? queryError };
  }
  return { code: url.searchParams.get('code'), error: null };
}

export async function signInWithGoogle(): Promise<{
  user: User | null;
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return { user: null, error: 'Supabase is not configured' };
  }

  if (!GOOGLE_CLIENT_ID) {
    return { user: null, error: 'Google OAuth client ID is not configured' };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { user: null, error: 'Supabase client is not available' };
  }

  const setup = getGoogleOAuthSetup();
  const redirectTo = getExtensionRedirectUri();

  try {
    const { data: oauthData, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        // Supabase already requests "email profile"; it appends whatever is passed
        // here, so request only "openid" to avoid duplicate scopes in the Google URL.
        // Google's consent screen requires openid (Supabase docs: "add manually").
        scopes: 'openid',
        queryParams: { prompt: 'select_account' },
      },
    });

    if (oauthError) {
      return { user: null, error: oauthError.message };
    }

    if (!oauthData.url) {
      return { user: null, error: 'Supabase did not return an OAuth URL' };
    }

    console.info('[RankMap Pro] Watching for redirect prefix:', redirectTo);

    const responseUrl = await launchAuthFlowInTab(oauthData.url, redirectTo);
    console.info('[RankMap Pro] Captured redirect:', responseUrl.split('?')[0]);

    const { code, error: authError } = parseAuthCode(responseUrl);

    if (authError) {
      return { user: null, error: formatGoogleAuthError(authError, setup) };
    }

    if (!code) {
      return { user: null, error: 'Sign-in redirect did not include an authorization code.' };
    }

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[RankMap Pro] exchangeCodeForSession error:', error);
      return { user: null, error: formatGoogleAuthError(error.message, setup) };
    }

    await refreshUserState();
    return { user: data.user, error: null };
  } catch (err) {
    console.error('[RankMap Pro] Google sign-in error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error during Google sign-in';
    return { user: null, error: formatGoogleAuthError(message, setup) };
  }
}

export function isGoogleAuthConfigured(): boolean {
  return isSupabaseConfigured() && Boolean(GOOGLE_CLIENT_ID);
}
