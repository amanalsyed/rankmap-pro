/**
 * Custom storage adapter for Supabase auth that uses chrome.storage.local
 * instead of localStorage (which doesn't exist in MV3 service workers).
 */

const AUTH_STORAGE_KEY = 'supabase_auth_session';

export const chromeStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    try {
      const data = await chrome.storage.local.get(AUTH_STORAGE_KEY);
      const storage = (data[AUTH_STORAGE_KEY] as Record<string, string>) ?? {};
      return storage[key] ?? null;
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      const data = await chrome.storage.local.get(AUTH_STORAGE_KEY);
      const storage = (data[AUTH_STORAGE_KEY] as Record<string, string>) ?? {};
      storage[key] = value;
      await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: storage });
    } catch {
      // Ignore storage errors
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      const data = await chrome.storage.local.get(AUTH_STORAGE_KEY);
      const storage = (data[AUTH_STORAGE_KEY] as Record<string, string>) ?? {};
      delete storage[key];
      await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: storage });
    } catch {
      // Ignore storage errors
    }
  },
};
