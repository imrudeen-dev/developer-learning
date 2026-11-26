import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { uniqueChannelTopic } from '../lib/realtime';
import { useAuth } from './auth-context';
import { supabase } from './supabase';

interface NotificationCenterValue {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
}

const NotificationCenterContext = createContext<NotificationCenterValue>({
  unreadCount: 0,
  refreshUnreadCount: async () => {},
});

export function NotificationCenterProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const userId = user?.id;

  const refreshUnreadCount = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }

    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', userId)
        .is('read_at', null);

      if (error) {
        console.error('[Becho] Could not refresh unread notification count:', error);
        return;
      }
      setUnreadCount(count ?? 0);
    } catch (error) {
      console.error('[Becho] Could not refresh unread notification count:', error);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }

    void refreshUnreadCount();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(uniqueChannelTopic(`notification-count:${userId}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => {
            void refreshUnreadCount();
          }, 100);
        }
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [userId, refreshUnreadCount]);

  return (
    <NotificationCenterContext.Provider value={{ unreadCount, refreshUnreadCount }}>
      {children}
    </NotificationCenterContext.Provider>
  );
}

export function useNotificationCenter() {
  return useContext(NotificationCenterContext);
}
