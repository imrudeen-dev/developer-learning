import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../../lib/auth-context';
import { formatTimeAgo } from '../../lib/listings';
import { supabase } from '../../lib/supabase';
import { BECHO_COLORS } from '../../lib/theme';

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
  const router = useRouter();

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
      <View style={styles.centered}>
        <Ionicons name="chatbubbles-outline" size={44} color={BECHO_COLORS.primary} />
        <Text style={styles.gateTitle}>Sign in to view your chats</Text>
        <Text style={styles.gateSub}>
          Message sellers directly about any item or rental on Becho.
        </Text>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.push('/(tabs)/profile')}
        >
          <Text style={styles.primaryBtnText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={BECHO_COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
      </View>

      <FlatList
        data={threads}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadThreads(true)}
            tintColor={BECHO_COLORS.primary}
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.threadCard}
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
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.peerName[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.rowBetween}>
                <Text style={styles.peerName} numberOfLines={1}>
                  {item.peerName}
                </Text>
                <Text style={styles.time}>{formatTimeAgo(item.lastAt)}</Text>
              </View>
              <Text style={styles.listingSub} numberOfLines={1}>
                {item.listingTitle}
              </Text>
              <Text style={styles.preview} numberOfLines={1}>
                {item.lastMessage}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons
              name="chatbox-ellipses-outline"
              size={44}
              color={BECHO_COLORS.textMuted}
            />
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptySub}>
              Open any listing on Home and tap "Chat with Seller" to start.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BECHO_COLORS.bg },
  centered: {
    flex: 1,
    backgroundColor: BECHO_COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: BECHO_COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: BECHO_COLORS.border,
  },
  headerTitle: { color: BECHO_COLORS.text, fontSize: 20, fontWeight: '800' },
  listContent: { padding: 14, gap: 10 },
  threadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: BECHO_COLORS.surface,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
    padding: 12,
    borderRadius: 14,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: BECHO_COLORS.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: BECHO_COLORS.primary, fontSize: 18, fontWeight: '800' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  peerName: { color: BECHO_COLORS.text, fontSize: 15, fontWeight: '700', flex: 1 },
  time: { color: BECHO_COLORS.textMuted, fontSize: 11 },
  listingSub: { color: BECHO_COLORS.primary, fontSize: 12, fontWeight: '600', marginTop: 1 },
  preview: { color: BECHO_COLORS.textMuted, fontSize: 13, marginTop: 3 },
  gateTitle: { color: BECHO_COLORS.text, fontSize: 18, fontWeight: '800', marginTop: 12 },
  gateSub: {
    color: BECHO_COLORS.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  primaryBtn: {
    backgroundColor: BECHO_COLORS.primary,
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: 10,
  },
  primaryBtnText: { color: '#052E16', fontWeight: '800' },
  emptyBox: { alignItems: 'center', paddingTop: 72, paddingHorizontal: 24 },
  emptyTitle: { color: BECHO_COLORS.text, fontSize: 16, fontWeight: '700', marginTop: 10 },
  emptySub: { color: BECHO_COLORS.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4 },
});