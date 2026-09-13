import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_WHITE_LABEL_SETTINGS,
  normalizeWhiteLabelSettings,
  readWhiteLabelSettings,
  writeWhiteLabelSettings,
  type WhiteLabelSettings,
} from '../settings/white-label-settings';

export function useWhiteLabelSettings() {
  const [settings, setSettings] = useState<WhiteLabelSettings>(DEFAULT_WHITE_LABEL_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSettings(await readWhiteLabelSettings());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const onStorage = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area !== 'local' || !changes.whiteLabelSettings) return;
      setSettings(
        normalizeWhiteLabelSettings(changes.whiteLabelSettings.newValue as Partial<WhiteLabelSettings>)
      );
    };

    const onMessage = (message: { type?: string; settings?: WhiteLabelSettings }) => {
      if (message.type === 'WHITE_LABEL_SETTINGS_UPDATE' && message.settings) {
        setSettings(normalizeWhiteLabelSettings(message.settings));
      }
    };

    chrome.storage.onChanged.addListener(onStorage);
    chrome.runtime.onMessage.addListener(onMessage);
    return () => {
      chrome.storage.onChanged.removeListener(onStorage);
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, [refresh]);

  const save = useCallback(async (next: WhiteLabelSettings) => {
    setSaving(true);
    setSaved(false);
    try {
      const normalized = await writeWhiteLabelSettings(next);
      setSettings(normalized);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, []);

  const updateSettings = useCallback((patch: Partial<WhiteLabelSettings>) => {
    setSettings((prev) => normalizeWhiteLabelSettings({ ...prev, ...patch }));
  }, []);

  return {
    settings,
    loading,
    saving,
    saved,
    refresh,
    save,
    updateSettings,
    setSettings,
  };
}
