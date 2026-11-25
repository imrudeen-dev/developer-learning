import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, TouchableOpacity, View } from 'react-native';
import { AppText as Text } from '../../components/app-text';
import { useAuth } from '../../lib/auth-context';
import { useAppPreferences } from '../../lib/app-preferences';
import { formatTimeAgo } from '../../lib/listings';
import { supabase } from '../../lib/supabase';

interface ThreadSummary {
  key: string;
  listingId: string;
  listingTitle: string;
  peerId: string;
  peerName: string;
  lastMessage: string;
  lastAt: string;
  direction: 'buying' | 'selling';
}

type InboxFilter = 'all' | 'buying' | 'selling';

export default function ChatsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { theme, t } = useAppPreferences();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadThreads = useCallback(async (refresh = false) => {
    if (!user) {
      setThreads([]);
      setLoading(false);
      return;
    }

    if (refresh) setRefreshing(true);
    else setLoading(true);
    setErrorMessage('');

    try {
      const { data, error } = await supabase
        .from('messages')
        .select(
          `id, listing_id, sender_id, receiver_id, content, created_at,
           listings:listing_id (title, seller_id)`
        )
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;

      const grouped = new Map<string, ThreadSummary>();
      const peerIds = new Set<string>();
      for (const row of data ?? []) {
        const peerId = row.sender_id === user.id ? row.receiver_id : row.sender_id;
        const listing = Array.isArray(row.listings) ? row.listings[0] : row.listings;
        const key = `${row.listing_id}:${peerId}`;
        peerIds.add(peerId);
        if (!grouped.has(key)) {
          grouped.set(key, {
            key,
            listingId: row.listing_id,
            listingTitle: listing?.title || 'Marketplace listing',
            peerId,
            peerName: 'Becho member',
            lastMessage: row.content,
            lastAt: row.created_at,
            direction: listing?.seller_id === user.id ? 'selling' : 'buying',
          });
        }
      }

      if (peerIds.size > 0) {
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', Array.from(peerIds));
        if (profileError) throw profileError;
        const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
        for (const thread of grouped.values()) {
          thread.peerName = names.get(thread.peerId) || 'Becho member';
        }
      }

      setThreads(Array.from(grouped.values()));
    } catch (loadError) {
      console.error('[Becho] Could not load chat inbox:', loadError);
      setErrorMessage('Your conversations could not be loaded. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void loadThreads();
    }, [loadThreads])
  );

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`inbox:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const message = payload.new as { sender_id?: string; receiver_id?: string };
        if (message.sender_id === user.id || message.receiver_id === user.id) {
          void loadThreads(true);
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadThreads, user]);

  const visibleThreads = useMemo(
    () => threads.filter((thread) => filter === 'all' || thread.direction === filter),
    [threads, filter]
  );

  if (!user) {
    return (
      <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: theme.background }}>
        <View className="h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: theme.surface }}>
          <Ionicons name="chatbubbles-outline" size={26} color={theme.primary} />
        </View>
        <Text className="mt-4 text-lg font-bold text-white">{t('messages')}</Text>
        <Text className="mt-2 text-center text-sm leading-5 text-gray-400">
          {t('signInToChat')}
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
      <View className="px-4 pb-4 pt-4">
        <Text className="text-2xl font-extrabold text-white">{t('messages')}</Text>
        <Text className="mt-1 text-sm text-gray-400">{t('keepConversations')}</Text>
        <View className="mt-4 flex-row rounded-xl p-1" style={{ backgroundColor: theme.surface }}>
          {(['all', 'buying', 'selling'] as const).map((item) => (
            <TouchableOpacity
              key={item}
              onPress={() => setFilter(item)}
              className="mr-1 flex-1 items-center rounded-lg py-2"
              style={{ backgroundColor: filter === item ? theme.border : 'transparent' }}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === item }}
            >
              <Text className={`text-xs font-semibold ${filter === item ? 'text-white' : 'text-gray-400'}`}>
                {item === 'all' ? t('allConversations') : t(item)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {!!errorMessage && (
        <Text className="mx-4 mb-2 rounded-xl bg-red-500/10 p-3 text-xs text-red-200">
          {errorMessage}
        </Text>
      )}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={visibleThreads}
          keyExtractor={(item) => item.key}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadThreads(true)}
              tintColor={theme.primary}
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: '/chat/[listingId]',
                  params: { listingId: item.listingId, peerId: item.peerId, title: item.listingTitle },
                })
              }
              className="mb-3 flex-row items-center rounded-2xl border p-3"
              style={{ backgroundColor: theme.surface, borderColor: theme.border }}
              accessibilityRole="button"
              accessibilityLabel={`Chat with ${item.peerName} about ${item.listingTitle}`}
            >
              <View className="mr-3 h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: `${theme.primary}1A` }}>
                <Text className="text-base font-bold" style={{ color: theme.primary }}>
                  {item.peerName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View className="flex-1">
                <View className="flex-row items-center justify-between">
                  <Text className="flex-1 font-bold text-white" numberOfLines={1}>{item.peerName}</Text>
                  <Text className="ml-2 text-[10px] text-gray-500">{formatTimeAgo(item.lastAt)}</Text>
                </View>
                <Text className="mt-1 text-xs font-semibold" style={{ color: theme.primary }} numberOfLines={1}>
                  {item.listingTitle} · {t(item.direction)}
                </Text>
                <Text className="mt-1 text-xs text-gray-400" numberOfLines={1}>{item.lastMessage}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center px-8">
              <Ionicons name="chatbox-ellipses-outline" size={38} color={theme.primary} />
              <Text className="mt-3 text-base font-bold text-white">{t('noConversations')}</Text>
              <Text className="mt-1 text-center text-sm leading-5 text-gray-400">
                {t('startChatHint')}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
