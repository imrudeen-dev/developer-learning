import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { uniqueChannelTopic } from '../lib/realtime';
import { supabase } from './supabase';

export interface PlatformSettings {
  maintenance_mode: boolean;
  allow_listings: boolean;
  chat_enabled: boolean;
  offers_enabled: boolean;
  require_verified_sellers: boolean;
}

interface PlatformSettingsContextValue {
  settings: PlatformSettings;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const DEFAULT_SETTINGS: PlatformSettings = {
  maintenance_mode: false,
  allow_listings: true,
  chat_enabled: true,
  offers_enabled: true,
  require_verified_sellers: false,
};

const PlatformSettingsContext = createContext<PlatformSettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  loading: true,
  error: null,
  refresh: async () => {},
});

export function PlatformSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { data, error: queryError } = await supabase
        .from('platform_feature_flags')
        .select('setting_key, value');
      if (queryError) throw queryError;

      const values = new Map((data ?? []).map((row) => [row.setting_key, row.value]));
      setSettings({
        maintenance_mode: values.get('maintenance_mode') === true,
        allow_listings: values.get('allow_listings') !== false,
        chat_enabled: values.get('chat_enabled') !== false,
        offers_enabled: values.get('offers_enabled') !== false,
        require_verified_sellers: values.get('require_verified_sellers') === true,
      });
      setError(null);
    } catch (loadError) {
      console.error('[Becho] Could not load platform feature controls:', loadError);
      setError('Platform controls are unavailable. Apply the marketplace database migration.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel(uniqueChannelTopic('platform-settings'))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'platform_feature_flags' },
        () => {
          void refresh();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return (
    <PlatformSettingsContext.Provider value={{ settings, loading, error, refresh }}>
      {children}
    </PlatformSettingsContext.Provider>
  );
}

export function usePlatformSettings() {
  return useContext(PlatformSettingsContext);
}
