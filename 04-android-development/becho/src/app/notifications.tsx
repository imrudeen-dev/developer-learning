import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, TouchableOpacity, View } from 'react-native';
import { AppText as Text } from '../components/app-text';
import { useAppPreferences } from '../lib/app-preferences';
import { useAuth } from '../lib/auth-context';
import { formatTimeAgo } from '../lib/listings';
import { useNotificationCenter } from '../lib/notification-center';
import { uniqueChannelTopic } from '../lib/realtime';
import { supabase } from '../lib/supabase';

interface AppNotification {
  id: string;
  actor_id: string | null;
  notification_type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  created_at: string;
  read_at: string | null;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { theme, t } = useAppPreferences();
  const { unreadCount, refreshUnreadCount } = useNotificationCenter();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [markingAllRead, setMarkingAllRead] = useState(false);

  const loadNotifications = useCallback(async (showLoading = true) => {
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    if (showLoading) setLoading(true);
    setErrorMessage('');
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, actor_id, notification_type, title, body, data, created_at, read_at')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setNotifications((data ?? []) as AppNotification[]);
    } catch (error) {
      console.error('[Becho] Could not load notifications:', error);
      setErrorMessage(t('notificationLoadError'));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [user, t]);

  useFocusEffect(
    useCallback(() => {
      void loadNotifications(true);
    }, [loadNotifications])
  );

  useEffect(() => {
    if (!user) return;

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(uniqueChannelTopic(`notifications-screen:${user.id}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${user.id}`,
        },
        () => {
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => {
            void loadNotifications(false);
          }, 100);
        }
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [user, loadNotifications]);

  const markRead = async (item: AppNotification) => {
    if (!item.read_at) {
      if (!user) return;
      const readAt = new Date().toISOString();
      try {
        const { error } = await supabase
          .from('notifications')
          .update({ read_at: readAt })
          .eq('id', item.id)
          .eq('recipient_id', user.id);
        if (error) throw error;
        setNotifications((current) =>
          current.map((notification) =>
            notification.id === item.id ? { ...notification, read_at: readAt } : notification
          )
        );
        void refreshUnreadCount();
      } catch (error) {
        console.error('[Becho] Could not mark notification as read:', error);
        setErrorMessage(t('notificationReadError'));
        return;
      }
    }

    const listingId = item.data?.listing_id;
    if (item.notification_type === 'message_received' && typeof listingId === 'string') {
      router.push({
        pathname: '/chat/[listingId]',
        params: {
          listingId,
          ...(item.actor_id ? { peerId: item.actor_id } : {}),
        },
      });
    } else if (
      item.notification_type.startsWith('offer_') ||
      item.notification_type.startsWith('deal_')
    ) {
      router.push('/(tabs)/orders');
    } else if (typeof listingId === 'string') {
      router.push(`/listing/${listingId}`);
    }
  };

  const markAllRead = async () => {
    if (!user || unreadCount === 0 || markingAllRead) return;
    setMarkingAllRead(true);
    setErrorMessage('');
    const readAt = new Date().toISOString();
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: readAt })
        .eq('recipient_id', user.id)
        .is('read_at', null);
      if (error) throw error;

      setNotifications((current) =>
        current.map((item) => (item.read_at ? item : { ...item, read_at: readAt }))
      );
      await refreshUnreadCount();
    } catch (markError) {
      console.error('[Becho] Could not mark all notifications as read:', markError);
      setErrorMessage(t('notificationsReadError'));
    } finally {
      setMarkingAllRead(false);
    }
  };

  if (!user) {
    return (
      <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: theme.background }}>
        <Ionicons name="notifications-outline" size={38} color={theme.primary} />
        <Text className="mt-4 text-lg font-bold text-white">{t('signInForNotifications')}</Text>
        <Text className="mt-2 text-center text-sm text-gray-400">
          {t('notificationSignInHint')}
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/profile')}
          className="mt-5 rounded-xl px-5 py-3"
          style={{ backgroundColor: theme.primary }}
        >
          <Text className="font-bold text-[#052e16]">{t('signIn')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      <View
        className="flex-row items-center border-b px-4 py-4"
        style={{ backgroundColor: theme.surface, borderColor: theme.border }}
      >
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)/profile');
          }}
          className="mr-3 h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: theme.background }}
          accessibilityLabel={t('goBack')}
        >
          <Ionicons name="arrow-back" size={19} color="white" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-lg font-bold text-white">{t('notifications')}</Text>
          <Text className="mt-0.5 text-xs text-gray-400">
            {unreadCount > 0 ? `${unreadCount} ${t('unread')}` : t('upToDate')}
          </Text>
        </View>
        <View className="flex-row items-center">
          {unreadCount > 0 && (
            <TouchableOpacity
              onPress={() => void markAllRead()}
              disabled={markingAllRead}
              className="mr-3 rounded-full px-3 py-2"
              style={{ backgroundColor: `${theme.primary}1A` }}
              accessibilityRole="button"
              accessibilityLabel={t('markAllRead')}
            >
              <Text className="text-[11px] font-bold" style={{ color: theme.primary }}>
                {markingAllRead ? t('starting') : t('markAllRead')}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => void loadNotifications(true)}
            accessibilityRole="button"
            accessibilityLabel={t('refresh')}
          >
            <Ionicons name="refresh-outline" size={20} color={theme.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => void markRead(item)}
              className="mb-3 flex-row rounded-2xl border p-4"
              style={{
                backgroundColor: item.read_at ? theme.surface : `${theme.primary}0D`,
                borderColor: item.read_at ? theme.border : `${theme.primary}4D`,
              }}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.body}`}
            >
              <View
                className="mr-3 h-10 w-10 items-center justify-center rounded-full"
                style={{ backgroundColor: theme.background }}
              >
                <Ionicons
                  name={
                    item.notification_type === 'message_received'
                      ? 'chatbubble-outline'
                      : item.notification_type.startsWith('deal_')
                        ? 'checkmark-circle-outline'
                        : item.notification_type.startsWith('offer_')
                          ? 'pricetag-outline'
                          : 'notifications-outline'
                  }
                  size={18}
                  color={item.read_at ? '#9ca3af' : theme.primary}
                />
              </View>
              <View className="flex-1">
                <View className="flex-row items-start justify-between">
                  <Text className="flex-1 font-bold text-white">{item.title}</Text>
                  {!item.read_at && <View className="ml-2 mt-1.5 h-2 w-2 rounded-full bg-emerald-400" />}
                </View>
                <Text className="mt-1 text-sm leading-5 text-gray-300">{item.body}</Text>
                <Text className="mt-2 text-[11px] text-gray-500">{formatTimeAgo(item.created_at)}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center px-6">
              <Ionicons name="checkmark-done-outline" size={38} color={theme.primary} />
              <Text className="mt-3 font-bold text-white">{t('caughtUp')}</Text>
              <Text className="mt-1 text-center text-sm text-gray-400">
                {t('newActivityHint')}
              </Text>
            </View>
          }
          ListHeaderComponent={
            errorMessage ? (
              <View className="mb-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3">
                <Text className="text-xs text-amber-200">{errorMessage}</Text>
              </View>
            ) : undefined
          }
        />
      )}
    </View>
  );
}
