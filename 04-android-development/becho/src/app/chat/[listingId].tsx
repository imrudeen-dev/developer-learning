import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HapticButton } from '../../components/NativeUI';
import { useAuth } from '../../lib/auth-context';
import { formatTimeAgo } from '../../lib/listings';
import { supabase } from '../../lib/supabase';
import { getCardElevation, useBechoTheme } from '../../lib/theme';

interface ChatMessage {
  id: string;
  listing_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
}

export default function ChatThreadScreen() {
  const { listingId, sellerId, title, peerId } = useLocalSearchParams<{
    listingId: string;
    sellerId?: string;
    title?: string;
    peerId?: string;
  }>();
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useBechoTheme();
  const insets = useSafeAreaInsets();
  const c = theme.colors;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [resolvedPeerId, setResolvedPeerId] = useState<string | null>(
    peerId || sellerId || null
  );
  const [listingTitle, setListingTitle] = useState<string>(title || 'Listing Chat');
  const [peerName, setPeerName] = useState<string>('Becho Member');

  const listRef = useRef<FlatList<ChatMessage>>(null);

  // Resolve listing title & counterparty ID/name if opened from inbox
  useEffect(() => {
    if (!listingId || !user) return;
    let active = true;

    (async () => {
      const { data: listingRow } = await supabase
        .from('listings')
        .select('title, seller_id')
        .eq('id', listingId)
        .single();

      if (!active) return;
      if (listingRow?.title && !title) {
        setListingTitle(listingRow.title);
      }

      let candidatePeerId = resolvedPeerId;

      if (!candidatePeerId && listingRow) {
        if (listingRow.seller_id !== user.id) {
          candidatePeerId = listingRow.seller_id;
          setResolvedPeerId(listingRow.seller_id);
        } else {
          const { data: latestMsg } = await supabase
            .from('messages')
            .select('sender_id, receiver_id')
            .eq('listing_id', listingId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (active && latestMsg) {
            const buyer =
              latestMsg.sender_id === user.id ? latestMsg.receiver_id : latestMsg.sender_id;
            candidatePeerId = buyer;
            setResolvedPeerId(buyer);
          }
        }
      }

      if (active && candidatePeerId) {
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', candidatePeerId)
          .maybeSingle();
        if (active && profileRow?.full_name) {
          setPeerName(profileRow.full_name);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [listingId, user, title, resolvedPeerId]);

  const loadMessages = useCallback(async () => {
    if (!listingId || !user) return;
    setLoading(true);
    try {
      let query = supabase
        .from('messages')
        .select('id, listing_id, sender_id, receiver_id, content, created_at')
        .eq('listing_id', listingId)
        .order('created_at', { ascending: true });

      if (resolvedPeerId) {
        query = query.or(
          `and(sender_id.eq.${user.id},receiver_id.eq.${resolvedPeerId}),and(sender_id.eq.${resolvedPeerId},receiver_id.eq.${user.id})`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      setMessages((data as ChatMessage[]) ?? []);
    } catch (err) {
      console.error('[Becho] Failed to load chat messages:', err);
    } finally {
      setLoading(false);
    }
  }, [listingId, user, resolvedPeerId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Subscribe to real-time INSERTs on messages for this listing
  useEffect(() => {
    if (!listingId || !user) return;

    const channel = supabase
      .channel(`chat:${listingId}:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `listing_id=eq.${listingId}`,
        },
        (payload) => {
          const incoming = payload.new as ChatMessage;
          const involvesMe =
            incoming.sender_id === user.id || incoming.receiver_id === user.id;
          if (!involvesMe) return;

          if (
            resolvedPeerId &&
            incoming.sender_id !== resolvedPeerId &&
            incoming.receiver_id !== resolvedPeerId
          ) {
            return;
          }

          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [listingId, user, resolvedPeerId]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !user || !listingId) return;

    if (!resolvedPeerId) {
      Alert.alert('Cannot Send', 'Waiting for buyer/seller context.');
      return;
    }

    setSending(true);
    setDraft('');

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          listing_id: listingId,
          sender_id: user.id,
          receiver_id: resolvedPeerId,
          content: text,
        })
        .select('id, listing_id, sender_id, receiver_id, content, created_at')
        .single();

      if (error) throw error;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      if (data) {
        setMessages((prev) =>
          prev.some((m) => m.id === data.id) ? prev : [...prev, data as ChatMessage]
        );
      }
    } catch (err: any) {
      setDraft(text);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Message Failed', err.message ?? 'Could not send message');
    } finally {
      setSending(false);
    }
  };

  if (!user) {
    return (
      <View style={[styles.centered, { backgroundColor: c.bg }]}>
        <Text style={[styles.gateText, { color: c.text }]}>
          Sign in to chat with sellers.
        </Text>
        <HapticButton
          hapticStyle="medium"
          style={[
            styles.signInBtn,
            { backgroundColor: c.primary, borderRadius: theme.radius.md },
          ]}
          onPress={() => router.replace('/(tabs)/profile')}
        >
          <Text style={[styles.signInBtnText, { color: c.primaryText }]}>
            Go to Sign In
          </Text>
        </HapticButton>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: c.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      {/* NATIVE CHAT HEADER */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: c.surface,
            paddingTop: Math.max(insets.top, 12),
            ...getCardElevation(theme),
          },
        ]}
      >
        <HapticButton
          hapticStyle="light"
          style={[
            styles.iconCircleBtn,
            { backgroundColor: c.surfaceElevated },
          ]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={20} color={c.text} />
        </HapticButton>

        <View
          style={[
            styles.peerAvatar,
            { borderColor: c.primary, backgroundColor: c.primaryMuted },
          ]}
        >
          <Text style={[styles.peerInitial, { color: c.primary }]}>
            {peerName[0].toUpperCase()}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: c.text }]} numberOfLines={1}>
            {peerName}
          </Text>
          <View style={styles.subRow}>
            <View style={[styles.liveDot, { backgroundColor: c.primary }]} />
            <Text
              style={[styles.headerSub, { color: c.textMuted }]}
              numberOfLines={1}
            >
              {listingTitle}
            </Text>
          </View>
        </View>

        <HapticButton
          hapticStyle="light"
          style={[
            styles.iconCircleBtn,
            { backgroundColor: c.surfaceElevated },
          ]}
          onPress={() => router.push(`/listing/${listingId}`)}
        >
          <Ionicons name="pricetag-outline" size={18} color={c.primary} />
        </HapticButton>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const mine = item.sender_id === user.id;
            return (
              <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
                <View
                  style={[
                    styles.bubble,
                    mine
                      ? [
                          styles.bubbleMine,
                          {
                            backgroundColor: c.primary,
                            borderRadius: theme.radius.lg,
                            ...getCardElevation(theme),
                          },
                        ]
                      : [
                          styles.bubbleTheirs,
                          {
                            backgroundColor: c.surface,
                            borderRadius: theme.radius.lg,
                            ...getCardElevation(theme),
                          },
                        ],
                  ]}
                >
                  <Text
                    style={[
                      styles.bubbleText,
                      { color: mine ? c.primaryText : c.text },
                      mine && { fontWeight: '600' },
                    ]}
                  >
                    {item.content}
                  </Text>
                  <Text
                    style={[
                      styles.timeText,
                      {
                        color: mine ? c.primaryText : c.textMuted,
                        opacity: mine ? 0.78 : 1,
                      },
                    ]}
                  >
                    {formatTimeAgo(item.created_at)}
                  </Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <View
                style={[
                  styles.emptyIconWrap,
                  {
                    backgroundColor: c.surface,
                    borderRadius: theme.radius.xl,
                    ...getCardElevation(theme),
                  },
                ]}
              >
                <Ionicons name="chatbubbles-outline" size={34} color={c.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: c.text }]}>
                Start the conversation
              </Text>
              <Text style={[styles.emptySub, { color: c.textMuted }]}>
                Ask about item condition, availability, or pickup spot.
              </Text>
            </View>
          }
        />
      )}

      {/* NATIVE INPUT COMPOSER */}
      <View
        style={[
          styles.composer,
          {
            backgroundColor: c.surface,
            paddingBottom: Math.max(insets.bottom, 10),
            ...getCardElevation(theme),
          },
        ]}
      >
        <TextInput
          style={[
            styles.composerInput,
            {
              backgroundColor: c.surfaceElevated,
              borderRadius: theme.radius.xl,
              color: c.text,
            },
          ]}
          placeholder="Message..."
          placeholderTextColor={c.textMuted}
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={500}
        />
        <HapticButton
          hapticStyle="medium"
          style={[
            styles.sendBtn,
            { backgroundColor: c.primary },
            (!draft.trim() || sending) && { opacity: 0.45 },
          ]}
          onPress={handleSend}
          disabled={!draft.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color={c.primaryText} />
          ) : (
            <Ionicons name="send" size={18} color={c.primaryText} />
          )}
        </HapticButton>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  gateText: { fontSize: 15, marginBottom: 14, fontWeight: '600' },
  signInBtn: {
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  signInBtnText: { fontWeight: '800' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  iconCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  peerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  peerInitial: { fontSize: 16, fontWeight: '900' },
  headerTitle: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  headerSub: { fontSize: 11, fontWeight: '600', flex: 1 },
  messageList: { padding: 14, paddingBottom: 20, gap: 10 },
  bubbleRow: { flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMine: {
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  timeText: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end', fontWeight: '600' },
  emptyChat: { alignItems: 'center', paddingTop: 72, paddingHorizontal: 24 },
  emptyIconWrap: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', marginTop: 10 },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 19,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  composerInput: {
    flex: 1,
    maxHeight: 100,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '500',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});