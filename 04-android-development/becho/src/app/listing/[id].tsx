import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HapticButton, ScreenHeader } from '../../components/NativeUI';
import { useAuth } from '../../lib/auth-context';
import { Listing, formatINR, formatListingPrice, formatTimeAgo } from '../../lib/listings';
import { supabase } from '../../lib/supabase';
import { getCardElevation, useBechoTheme } from '../../lib/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useBechoTheme();
  const insets = useSafeAreaInsets();
  const c = theme.colors;

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);

  useEffect(() => {
    if (!id) return;
    let mounted = true;

    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('listings')
        .select(
          `
          id,
          seller_id,
          title,
          description,
          listing_type,
          category,
          price,
          rent_period,
          security_deposit,
          city,
          locality,
          latitude,
          longitude,
          images,
          status,
          created_at,
          profiles:seller_id (
            full_name,
            phone,
            city
          )
        `
        )
        .eq('id', id)
        .single();

      if (!mounted) return;
      if (error || !data) {
        Alert.alert('Not Found', 'This listing may have been removed.');
        router.back();
        return;
      }
      setListing(data as unknown as Listing);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [id, router]);

  if (loading || !listing) {
    return (
      <View style={[styles.centered, { backgroundColor: c.bg }]}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }

  const isOwner = user?.id === listing.seller_id;
  const isRent = listing.listing_type === 'RENT';
  const locationLabel = [listing.locality, listing.city].filter(Boolean).join(', ');
  const sellerName = listing.profiles?.full_name || 'Becho Seller';

  const handleChatPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (!user) {
      router.push('/(tabs)/profile');
      return;
    }
    router.push({
      pathname: '/chat/[listingId]',
      params: {
        listingId: listing.id,
        sellerId: listing.seller_id,
        title: listing.title,
      },
    });
  };

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      {/* TOP BAR */}
      <ScreenHeader
        title="Ad Details"
        subtitle={listing.category}
        leftAction={
          <HapticButton
            hapticStyle="light"
            style={[
              styles.backBtn,
              {
                backgroundColor: c.surfaceElevated,
                borderColor: c.border,
                borderRadius: theme.radius.md,
              },
            ]}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={20} color={c.text} />
          </HapticButton>
        }
        rightAction={<View style={{ width: 38 }} />}
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 112 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* PHOTO CAROUSEL */}
        <View style={[styles.carouselWrap, { backgroundColor: c.surfaceElevated }]}>
          {listing.images && listing.images.length > 0 ? (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                  Haptics.selectionAsync().catch(() => {});
                  setActivePhotoIdx(idx);
                }}
              >
                {listing.images.map((uri, i) => (
                  <Image
                    key={uri + i}
                    source={{ uri }}
                    style={{ width: SCREEN_WIDTH, height: 280 }}
                  />
                ))}
              </ScrollView>
              <View style={[styles.photoCounter, { backgroundColor: c.overlay }]}>
                <Text style={styles.photoCounterText}>
                  {activePhotoIdx + 1} / {listing.images.length}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.noPhotoBox}>
              <Ionicons name="image-outline" size={48} color={c.textMuted} />
              <Text style={[styles.noPhotoText, { color: c.textMuted }]}>
                No photos provided
              </Text>
            </View>
          )}
        </View>

        {/* MAIN DETAILS */}
        <View style={styles.body}>
          <View style={styles.tagRow}>
            <View
              style={[
                styles.typeBadge,
                {
                  backgroundColor: isRent ? c.rentBadge : c.sellBadge,
                  borderRadius: theme.radius.sm,
                },
              ]}
            >
              <Text
                style={[
                  styles.typeBadgeText,
                  { color: isRent ? c.rentText : c.sellText },
                ]}
              >
                {isRent ? 'FOR RENT' : 'FOR SALE'}
              </Text>
            </View>
            <View
              style={[
                styles.catBadge,
                {
                  backgroundColor: c.surfaceElevated,
                  borderColor: c.border,
                  borderRadius: theme.radius.sm,
                },
              ]}
            >
              <Text style={[styles.catBadgeText, { color: c.textMuted }]}>
                {listing.category}
              </Text>
            </View>
          </View>

          <Text style={[styles.price, { color: c.primary }]}>
            {formatListingPrice(listing)}
          </Text>

          {isRent && (listing.security_deposit ?? 0) > 0 && (
            <Text style={[styles.depositText, { color: c.textMuted }]}>
              Security Deposit: {formatINR(listing.security_deposit!)}
            </Text>
          )}

          <Text style={[styles.title, { color: c.text }]}>{listing.title}</Text>

          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={16} color={c.primary} />
            <Text style={[styles.metaText, { color: c.textMuted }]}>
              {locationLabel || 'Chennai'}
            </Text>
            <Text style={[styles.dot, { color: c.textMuted }]}>•</Text>
            <Text style={[styles.metaText, { color: c.textMuted }]}>
              {formatTimeAgo(listing.created_at)}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: c.border }]} />

          <Text style={[styles.sectionHeading, { color: c.text }]}>Description</Text>
          <Text style={[styles.description, { color: c.textSecondary }]}>
            {listing.description || 'No additional description provided by the seller.'}
          </Text>

          <View style={[styles.divider, { backgroundColor: c.border }]} />

          {/* SELLER CARD */}
          <Text style={[styles.sectionHeading, { color: c.text }]}>Seller</Text>
          <View
            style={[
              styles.sellerCard,
              {
                backgroundColor: c.surface,
                borderColor: c.border,
                borderRadius: theme.radius.lg,
                ...getCardElevation(theme),
              },
            ]}
          >
            <View style={[styles.sellerAvatar, { backgroundColor: c.primaryMuted }]}>
              <Text style={[styles.sellerInitial, { color: c.primary }]}>
                {sellerName[0].toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sellerName, { color: c.text }]}>{sellerName}</Text>
              <Text style={[styles.sellerSub, { color: c.textMuted }]}>
                {listing.profiles?.city || listing.city || 'Chennai'}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* BOTTOM ACTION BAR */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: c.surface,
            borderTopColor: c.border,
            paddingBottom: Math.max(insets.bottom, 14),
          },
        ]}
      >
        {isOwner ? (
          <View
            style={[
              styles.ownerBanner,
              {
                backgroundColor: c.surfaceElevated,
                borderColor: c.border,
                borderRadius: theme.radius.md,
              },
            ]}
          >
            <Ionicons name="checkmark-circle" size={18} color={c.primary} />
            <Text style={[styles.ownerBannerText, { color: c.text }]}>
              You published this listing
            </Text>
          </View>
        ) : (
          <HapticButton
            hapticStyle="medium"
            style={[
              styles.chatBtn,
              {
                backgroundColor: c.primary,
                borderRadius: theme.radius.md,
                ...getCardElevation(theme),
              },
            ]}
            onPress={handleChatPress}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={c.primaryText} />
            <Text style={[styles.chatBtnText, { color: c.primaryText }]}>
              Chat with Seller
            </Text>
          </HapticButton>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backBtn: {
    width: 38,
    height: 38,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {},
  carouselWrap: { width: SCREEN_WIDTH, height: 280 },
  noPhotoBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  noPhotoText: { fontSize: 13 },
  photoCounter: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  photoCounterText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  body: { padding: 16 },
  tagRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4 },
  typeBadgeText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
  catBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  catBadgeText: { fontSize: 11, fontWeight: '700' },
  price: { fontSize: 26, fontWeight: '900' },
  depositText: { fontSize: 13, marginTop: 4 },
  title: { fontSize: 19, fontWeight: '700', marginTop: 8, lineHeight: 25 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  metaText: { fontSize: 13 },
  dot: {},
  divider: { height: 1, marginVertical: 18 },
  sectionHeading: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  description: { fontSize: 14, lineHeight: 22 },
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    padding: 14,
  },
  sellerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerInitial: { fontSize: 18, fontWeight: '800' },
  sellerName: { fontSize: 15, fontWeight: '700' },
  sellerSub: { fontSize: 12, marginTop: 2 },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  chatBtnText: { fontSize: 15, fontWeight: '800' },
  ownerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
  },
  ownerBannerText: { fontSize: 14, fontWeight: '700' },
});