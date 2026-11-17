import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BechoLogoMark, HapticButton, ScreenHeader } from '../../components/NativeUI';
import { useAuth } from '../../lib/auth-context';
import { formatTimeAgo } from '../../lib/listings';
import { supabase } from '../../lib/supabase';
import { getCardElevation, useBechoTheme } from '../../lib/theme';

interface ThreadSummary {
  key: string;
  listingId: string;
  listingTitle: string;
  peerId: string;
  peerName: string;
  lastMessage: string;
  lastAt: string;
}

export default function ChatsInboxScreen() {
  const { user } = useAuth();
  const { theme } = useBechoTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const c = theme.colors;

  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadThreads = useCallback(
    async (isRefresh = false) => {
      if (!user) {
        setThreads([]);
        setLoading(false);
        return;
      }

      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const { data, error } = await supabase
          .from('messages')
          .select(
            `
            id,
            listing_id,
            sender_id,
            receiver_id,
            content,
            created_at,
            listings:listing_id ( title )
          `
          )
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const grouped = new Map<string, ThreadSummary>();
        const peerIds = new Set<string>();

        for (const row of data ?? []) {
          const peerId = row.sender_id === user.id ? row.receiver_id : row.sender_id;
          peerIds.add(peerId);
          const key = `${row.listing_id}:${peerId}`;
          if (!grouped.has(key)) {
            const listingObj = Array.isArray(row.listings) ? row.listings[0] : row.listings;
            grouped.set(key, {
              key,
              listingId: row.listing_id,
              listingTitle: listingObj?.title || 'Becho Listing',
              peerId,
              peerName: 'Becho Member',
              lastMessage: row.content,
              lastAt: row.created_at,
            });
          }
        }

        if (peerIds.size > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', Array.from(peerIds));

          const nameMap = new Map(
            (profiles ?? []).map((p) => [p.id, p.full_name || 'Becho Member'])
          );
          for (const thread of grouped.values()) {
            thread.peerName = nameMap.get(thread.peerId) || 'Becho Member';
          }
        }

        setThreads(Array.from(grouped.values()));
      } catch (err) {
        console.error('[Becho] Failed to load chat inbox:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user]
  );

  useFocusEffect(
    useCallback(() => {
      loadThreads(false);
    }, [loadThreads])
  );

  if (!user) {
    return (
      <View style={[styles.page, { backgroundColor: c.bg }]}>
        <ScreenHeader
          title="Messages"
          subtitle="Direct buyer & seller chat"
          leftAction={<BechoLogoMark size={34} />}
        />
        <View style={styles.centered}>
          <View
            style={[
              styles.gateIcon,
              {
                backgroundColor: c.surface,
                borderColor: c.border,
                borderRadius: theme.radius.xl,
                ...getCardElevation(theme),
              },
            ]}
          >
            <Ionicons name="chatbubbles-outline" size={40} color={c.primary} />
          </View>
          <Text style={[styles.gateTitle, { color: c.text }]}>
            Sign in to view your chats
          </Text>
          <Text style={[styles.gateSub, { color: c.textMuted }]}>
            Message sellers directly about any item or rental on Becho.
          </Text>
          <HapticButton
            hapticStyle="medium"
            style={[
              styles.primaryBtn,
              { backgroundColor: c.primary, borderRadius: theme.radius.md },
            ]}
            onPress={() => router.push('/(tabs)/profile')}
          >
            <Text style={[styles.primaryBtnText, { color: c.primaryText }]}>Sign In</Text>
          </HapticButton>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.page, { backgroundColor: c.bg }]}>
        <ScreenHeader
          title="Messages"
          subtitle="Loading conversations..."
          leftAction={<BechoLogoMark size={34} />}
        />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.page, { backgroundColor: c.bg }]}>
      <ScreenHeader
        title="Messages"
        subtitle={
          threads.length > 0
            ? `${threads.length} active ${threads.length === 1 ? 'thread' : 'threads'}`
            : 'Buyer & seller inbox'
        }
        leftAction={<BechoLogoMark size={34} />}
      />

      <FlatList
        data={threads}
        keyExtractor={(item) => item.key}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: 32 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadThreads(true)}
            tintColor={c.primary}
            colors={[c.primary]}
            progressBackgroundColor={c.surface}
          />
        }
        renderItem={({ item }) => (
          <HapticButton
            hapticStyle="light"
            style={[
              styles.threadCard,
              {
                backgroundColor: c.surface,
                borderColor: c.border,
                borderRadius: theme.radius.lg,
                ...getCardElevation(theme),
              },
            ]}
            onPress={() =>
              router.push({
                pathname: '/chat/[listingId]',
                params: {
                  listingId: item.listingId,
                  peerId: item.peerId,
                  title: item.listingTitle,
                },
              })
            }
          >
            <View style={[styles.avatar, { backgroundColor: c.primaryMuted }]}>
              <Text style={[styles.avatarText, { color: c.primary }]}>
                {item.peerName[0].toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.rowBetween}>
                <Text style={[styles.peerName, { color: c.text }]} numberOfLines={1}>
                  {item.peerName}
                </Text>
                <Text style={[styles.time, { color: c.textMuted }]}>
                  {formatTimeAgo(item.lastAt)}
                </Text>
              </View>
              <Text style={[styles.listingSub, { color: c.primary }]} numberOfLines={1}>
                {item.listingTitle}
              </Text>
              <Text style={[styles.preview, { color: c.textMuted }]} numberOfLines={1}>
                {item.lastMessage}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
          </HapticButton>
        )}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="chatbox-ellipses-outline" size={44} color={c.textMuted} />
            <Text style={[styles.emptyTitle, { color: c.text }]}>
              No conversations yet
            </Text>
            <Text style={[styles.emptySub, { color: c.textMuted }]}>
              Open any listing on Home and tap &ldquo;Chat with Seller&rdquo; to start.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  listContent: { padding: 14, gap: 10 },
  threadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    padding: 13,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '800' },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  peerName: { fontSize: 15, fontWeight: '700', flex: 1 },
  time: { fontSize: 11 },
  listingSub: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  preview: { fontSize: 13, marginTop: 3 },
  gateIcon: {
    width: 72,
    height: 72,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  gateTitle: { fontSize: 18, fontWeight: '800', marginTop: 12 },
  gateSub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
    lineHeight: 19,
  },
  primaryBtn: {
    paddingHorizontal: 26,
    paddingVertical: 12,
  },
  primaryBtnText: { fontWeight: '800', fontSize: 15 },
  emptyBox: { alignItems: 'center', paddingTop: 72, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 10 },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 19,
  },
});