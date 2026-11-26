import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from '../../components/app-text';
import { ChatLocationSharing } from '../../components/chat-location-sharing';
import { useAppPreferences } from '../../lib/app-preferences';
import { useAuth } from '../../lib/auth-context';
import { formatTimeAgo } from '../../lib/listings';
import { uniqueChannelTopic } from '../../lib/realtime';
import { supabase } from '../../lib/supabase';
import { BECHO_COLORS } from '../../lib/theme';

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
  const { theme, t } = useAppPreferences();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [resolvedPeerId, setResolvedPeerId] = useState<string | null>(
    peerId || sellerId || null
  );
  const [listingTitle, setListingTitle] = useState<string>(title || 'Listing Chat');
  const isSelfChat = Boolean(user && resolvedPeerId === user.id);

  const listRef = useRef<FlatList<ChatMessage>>(null);

  // Resolve listing title & counterparty ID if opened from inbox
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

      if (!resolvedPeerId && listingRow) {
        if (listingRow.seller_id !== user.id) {
          setResolvedPeerId(listingRow.seller_id);
        } else {
          // Seller opened thread: find the buyer from existing messages
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
            setResolvedPeerId(buyer);
          }
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
      .channel(uniqueChannelTopic(`chat:${listingId}:${user.id}`))
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
      setSendError(t('missingChatParticipant'));
      return;
    }

    if (resolvedPeerId === user.id) {
      setSendError(t('cannotMessageYourself'));
      return;
    }

    setSending(true);
    setDraft('');
    setSendError('');

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

      if (data) {
        setMessages((prev) =>
          prev.some((m) => m.id === data.id) ? prev : [...prev, data as ChatMessage]
        );
      }
    } catch (err: unknown) {
      setDraft(text);
      console.error('[Becho] Could not send chat message:', err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'object' &&
              err !== null &&
              'message' in err &&
              typeof err.message === 'string'
            ? err.message
            : t('sendMessageError');
      setSendError(
        errorMessage.toLowerCase().includes('row-level security') ||
          errorMessage.toLowerCase().includes('permission denied')
          ? t('chatPermissionError')
          : errorMessage
      );
    } finally {
      setSending(false);
    }
  };

  if (!user) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Text style={styles.gateText}>{t('signInToChatTitle')}</Text>
        <Text style={styles.emptySub}>{t('signInToChat')}</Text>
        <TouchableOpacity
          style={styles.signInBtn}
          onPress={() => router.replace('/(tabs)/profile')}
        >
          <Text style={styles.signInBtnText}>{t('goToSignIn')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      {/* HEADER */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: theme.background }]}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)/chats');
          }}
          accessibilityRole="button"
          accessibilityLabel={t('goBack')}
        >
          <Ionicons name="arrow-back" size={22} color="#f8fafc" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {listingTitle}
          </Text>
          <Text style={[styles.headerSub, { color: theme.primary }]}>{t('messages')}</Text>
        </View>
      </View>

      <View style={styles.safetyNotice} accessibilityRole="summary">
        <Ionicons name="shield-checkmark-outline" size={17} color="#fcd34d" />
        <Text style={styles.safetyNoticeText}>
          {t('safeChatTitle')}: {t('safeChatBody')}
        </Text>
      </View>

      {resolvedPeerId && !isSelfChat && (
        <ChatLocationSharing
          listingId={listingId}
          userId={user.id}
          peerId={resolvedPeerId}
        />
      )}

      {loading ? (
        <View style={[styles.centered, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const mine = item.sender_id === user.id;
            return (
              <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
                <View
                  style={[
                    styles.bubble,
                    mine
                      ? [styles.bubbleMine, { backgroundColor: theme.primary }]
                      : [styles.bubbleTheirs, { backgroundColor: theme.surface, borderColor: theme.border }],
                  ]}
                >
                  <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>
                    {item.content}
                  </Text>
                  <Text style={[styles.timeText, mine && styles.timeTextMine]}>
                    {formatTimeAgo(item.created_at)}
                  </Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Ionicons
                name="chatbubbles-outline"
                size={42}
                color={BECHO_COLORS.textMuted}
              />
              <Text style={styles.emptyTitle}>{t('startConversation')}</Text>
              <Text style={styles.emptySub}>
                {t('askSellerHint')}
              </Text>
            </View>
          }
        />
      )}

      {!!(sendError || isSelfChat) && (
        <Text accessibilityRole="alert" style={styles.sendError}>
          {sendError || t('cannotMessageYourself')}
        </Text>
      )}

      {/* INPUT COMPOSER */}
      <View
        style={[
          styles.composer,
          { backgroundColor: theme.surface, borderTopColor: theme.border },
        ]}
      >
        <TextInput
          style={[
            styles.composerInput,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
          placeholder={t('writeMessage')}
          placeholderTextColor={BECHO_COLORS.textMuted}
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[
            styles.sendBtn,
            { backgroundColor: theme.primary },
            (!draft.trim() || sending) && { opacity: 0.5 },
          ]}
          onPress={handleSend}
          disabled={!draft.trim() || sending || isSelfChat}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#052E16" />
          ) : (
            <Ionicons name="send" size={18} color="#052E16" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BECHO_COLORS.bg },
  centered: {
    flex: 1,
    backgroundColor: BECHO_COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  gateText: { color: BECHO_COLORS.text, fontSize: 15, marginBottom: 14 },
  signInBtn: {
    backgroundColor: BECHO_COLORS.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
  },
  signInBtnText: { color: '#052E16', fontWeight: '800' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: BECHO_COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: BECHO_COLORS.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: BECHO_COLORS.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: BECHO_COLORS.text, fontSize: 16, fontWeight: '700' },
  headerSub: { color: BECHO_COLORS.primary, fontSize: 11, fontWeight: '600', marginTop: 1 },
  safetyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.2)',
    backgroundColor: 'rgba(251,191,36,0.08)',
  },
  safetyNoticeText: { flex: 1, color: '#fde68a', fontSize: 11, lineHeight: 16 },
  messageList: { padding: 14, paddingBottom: 24, gap: 10 },
  bubbleRow: { flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleMine: {
    backgroundColor: BECHO_COLORS.primary,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: BECHO_COLORS.surface,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
    borderBottomLeftRadius: 4,
  },
  bubbleText: { color: BECHO_COLORS.text, fontSize: 14, lineHeight: 20 },
  bubbleTextMine: { color: '#052E16', fontWeight: '600' },
  timeText: { color: BECHO_COLORS.textMuted, fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  timeTextMine: { color: '#064E3B' },
  emptyChat: { alignItems: 'center', paddingTop: 72, paddingHorizontal: 24 },
  emptyTitle: { color: BECHO_COLORS.text, fontSize: 16, fontWeight: '700', marginTop: 10 },
  emptySub: {
    color: BECHO_COLORS.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  sendError: {
    color: '#fecaca',
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderRadius: 12,
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    fontSize: 12,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: BECHO_COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: BECHO_COLORS.border,
  },
  composerInput: {
    flex: 1,
    maxHeight: 100,
    backgroundColor: BECHO_COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: BECHO_COLORS.text,
    fontSize: 14,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: BECHO_COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});