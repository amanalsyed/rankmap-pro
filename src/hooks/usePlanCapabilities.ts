import { useCallback, useEffect, useRef, useState } from 'react';

import type { CachedUserState, Plan } from '../supabase/types';

import { capabilitiesFromUsage, type PlanCapabilities } from '../supabase/plan-capabilities';

import { emptyCachedUserState } from '../supabase/types';

const USER_STATE_STORAGE_KEY = 'nwf_user_state';

export function usePlanCapabilities() {
  const [state, setState] = useState<CachedUserState>(emptyCachedUserState());
  const [loading, setLoading] = useState(true);
  const skipStorageRefreshRef = useRef(false);

  const applyState = useCallback((next: CachedUserState) => {
    setState(next);
  }, []);

  const refresh = useCallback(async (fromCache = false) => {
    if (!fromCache) {
      setLoading(true);
    }
    try {
      const res = (await chrome.runtime.sendMessage({
        type: fromCache ? 'AUTH_GET_STATE' : 'AUTH_REFRESH_STATE',
      })) as {
        ok?: boolean;
        state?: CachedUserState;
      };

      applyState(res?.state ?? emptyCachedUserState());
    } finally {
      if (!fromCache) {
        setLoading(false);
      }
    }
  }, [applyState]);

  const syncFromCache = useCallback(async () => {
    const res = (await chrome.runtime.sendMessage({ type: 'AUTH_GET_STATE' })) as {
      ok?: boolean;
      state?: CachedUserState;
    };
    applyState(res?.state ?? emptyCachedUserState());
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

  const plan: Plan = state.profile?.plan ?? 'free';

  const capabilities: PlanCapabilities = capabilitiesFromUsage(
    state.usage as Record<string, unknown> | null,
    plan
  );

  return {
    loading,
    signedIn: Boolean(state.profile),
    plan,
    profile: state.profile,
    usage: state.usage,
    capabilities,
    refresh,
  };
}
