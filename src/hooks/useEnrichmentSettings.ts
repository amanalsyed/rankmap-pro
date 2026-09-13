import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_ENRICHMENT_SETTINGS,
  normalizeEnrichmentSettings,
  readEnrichmentSettings,
  writeEnrichmentSettings,
  type EnrichmentPlatformSettings,
  type EnrichmentSettings,
} from '../settings/enrichment-settings';

export function useEnrichmentSettings() {
  const [settings, setSettings] = useState<EnrichmentSettings>(DEFAULT_ENRICHMENT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSettings(await readEnrichmentSettings());
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
      if (area !== 'local' || !changes.enrichmentSettings) return;
      setSettings(
        normalizeEnrichmentSettings(changes.enrichmentSettings.newValue as Partial<EnrichmentSettings>)
      );
    };

    const onMessage = (message: { type?: string; settings?: EnrichmentSettings }) => {
      if (message.type === 'ENRICHMENT_SETTINGS_UPDATE' && message.settings) {
        setSettings(normalizeEnrichmentSettings(message.settings));
      }
    };

    chrome.storage.onChanged.addListener(onStorage);
    chrome.runtime.onMessage.addListener(onMessage);
    return () => {
      chrome.storage.onChanged.removeListener(onStorage);
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, [refresh]);

  const save = useCallback(async (next: EnrichmentSettings) => {
    setSaving(true);
    setSaved(false);
    try {
      const normalized = await writeEnrichmentSettings(next);
      setSettings(normalized);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<EnrichmentSettings>) => {
      setSettings((prev) => normalizeEnrichmentSettings({ ...prev, ...patch }));
    },
    []
  );

  const togglePlatform = useCallback((key: keyof EnrichmentPlatformSettings) => {
    setSettings((prev) =>
      normalizeEnrichmentSettings({
        ...prev,
        platforms: { ...prev.platforms, [key]: !prev.platforms[key] },
      })
    );
  }, []);

  return {
    settings,
    loading,
    saving,
    saved,
    refresh,
    save,
    updateSettings,
    togglePlatform,
    setSettings,
  };
}
