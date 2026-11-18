import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BechoLogoMark,
  HapticButton,
  NativeInput,
} from '../../components/NativeUI';
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
  const [searchQuery, setSearchQuery] = useState('');
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

  const filteredThreads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(
      (t) =>
        t.peerName.toLowerCase().includes(q) ||
        t.listingTitle.toLowerCase().includes(q) ||
        t.lastMessage.toLowerCase().includes(q)
    );
  }, [threads, searchQuery]);

  if (!user) {
    return (
      <View style={[styles.page, { backgroundColor: c.bg }]}>
        <View style={styles.topStrip}>
          <View style={styles.brandRow}>
            <BechoLogoMark size={36} />
            <Text style={[styles.screenTitle, { color: c.text }]}>Messages</Text>
          </View>
        </View>
        <View style={styles.centered}>
          <View
            style={[
              styles.gateIcon,
              {
                backgroundColor: c.surface,
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
              {
                backgroundColor: c.primary,
                borderRadius: theme.radius.md,
                ...getCardElevation(theme),
              },
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
        <View style={styles.topStrip}>
          <View style={styles.brandRow}>
            <BechoLogoMark size={36} />
            <Text style={[styles.screenTitle, { color: c.text }]}>Messages</Text>
          </View>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.page, { backgroundColor: c.bg }]}>
      {/* TOP BRAND HEADER */}
      <View style={styles.topStrip}>
        <View style={styles.brandRow}>
          <BechoLogoMark size={36} />
          <View>
            <Text style={[styles.screenTitle, { color: c.text }]}>Messages</Text>
            <Text style={[styles.screenSub, { color: c.textMuted }]}>
              {threads.length > 0
                ? `${threads.length} active ${threads.length === 1 ? 'chat' : 'chats'}`
                : 'Buyer & seller inbox'}
            </Text>
          </View>
        </View>
      </View>

      {/* SEARCH INBOX */}
      {threads.length > 0 && (
        <View style={styles.searchWrap}>
          <NativeInput
            icon="search-outline"
            placeholder="Search people, ads, or messages..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            rightElement={
              searchQuery.length > 0 ? (
                <HapticButton
                  hapticStyle="selection"
                  onPress={() => setSearchQuery('')}
                >
                  <Ionicons name="close-circle" size={18} color={c.textMuted} />
                </HapticButton>
              ) : undefined
            }
          />
        </View>
      )}

      <FlatList
        data={filteredThreads}
        keyExtractor={(item) => item.key}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: 104 + insets.bottom },
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
            scaleTo={0.98}
            style={[
              styles.threadCard,
              {
                backgroundColor: c.surface,
                borderRadius: theme.radius.xl,
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
            <View
              style={[
                styles.avatarRing,
                { borderColor: c.primary, backgroundColor: c.primaryMuted },
              ]}
            >
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

              <View
                style={[
                  styles.listingChip,
                  { backgroundColor: c.surfaceElevated, borderRadius: theme.radius.sm },
                ]}
              >
                <Text style={[styles.listingSub, { color: c.primary }]} numberOfLines={1}>
                  {item.listingTitle}
                </Text>
              </View>

              <Text style={[styles.preview, { color: c.textSecondary }]} numberOfLines={1}>
                {item.lastMessage}
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
          </HapticButton>
        )}
        ListEmptyComponent={
          <View
            style={[
              styles.emptyBox,
              { backgroundColor: c.surface, borderRadius: theme.radius.xl },
            ]}
          >
            <View style={[styles.emptyIconCircle, { backgroundColor: c.primaryMuted }]}>
              <Ionicons name="chatbox-ellipses-outline" size={32} color={c.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: c.text }]}>
              {searchQuery ? 'No matching chats' : 'No conversations yet'}
            </Text>
            <Text style={[styles.emptySub, { color: c.textMuted }]}>
              {searchQuery
                ? 'Try a different keyword or clear search.'
                : 'Open any listing on Home and tap "Chat with Seller" to start.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  topStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  screenTitle: { fontSize: 21, fontWeight: '900', letterSpacing: -0.4 },
  screenSub: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  searchWrap: {
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  listContent: { paddingHorizontal: 16, paddingTop: 6, gap: 12 },
  threadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  avatarRing: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 19, fontWeight: '900' },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  peerName: { fontSize: 15, fontWeight: '800', flex: 1, letterSpacing: -0.2 },
  time: { fontSize: 11, fontWeight: '600' },
  listingChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
    maxWidth: '95%',
  },
  listingSub: { fontSize: 11, fontWeight: '700' },
  preview: { fontSize: 13, marginTop: 5, fontWeight: '500' },
  gateIcon: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  gateTitle: { fontSize: 19, fontWeight: '900', marginTop: 12 },
  gateSub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
    lineHeight: 19,
  },
  primaryBtn: {
    paddingHorizontal: 26,
    paddingVertical: 13,
  },
  primaryBtnText: { fontWeight: '800', fontSize: 15 },
  emptyBox: {
    alignItems: 'center',
    marginTop: 28,
    paddingVertical: 36,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', marginTop: 14 },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
});