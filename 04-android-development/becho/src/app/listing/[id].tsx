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
import { HapticButton } from '../../components/NativeUI';
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
  const images = listing.images ?? [];

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
      {/* FLOATING TOP BACK BUTTON */}
      <View style={[styles.floatingTopBar, { top: Math.max(insets.top, 12) }]}>
        <HapticButton
          hapticStyle="light"
          style={[
            styles.floatingIconBtn,
            {
              backgroundColor: c.surface,
              ...getCardElevation(theme),
            },
          ]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={20} color={c.text} />
        </HapticButton>

        <View
          style={[
            styles.floatingPill,
            {
              backgroundColor: c.surface,
              ...getCardElevation(theme),
            },
          ]}
        >
          <Text style={[styles.floatingPillText, { color: c.text }]} numberOfLines={1}>
            {listing.category}
          </Text>
        </View>

        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 112 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* FULL-BLEED PHOTO GALLERY */}
        <View style={[styles.carouselWrap, { backgroundColor: c.surfaceElevated }]}>
          {images.length > 0 ? (
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
                {images.map((uri, i) => (
                  <Image
                    key={uri + i}
                    source={{ uri }}
                    style={{ width: SCREEN_WIDTH, height: 310 }}
                  />
                ))}
              </ScrollView>

              <View style={[styles.photoCounter, { backgroundColor: c.overlay }]}>
                <Text style={styles.photoCounterText}>
                  {activePhotoIdx + 1} / {images.length}
                </Text>
              </View>

              {images.length > 1 && (
                <View style={styles.dotsRow}>
                  {images.map((_, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.dotIndicator,
                        {
                          backgroundColor:
                            idx === activePhotoIdx ? c.primary : 'rgba(255,255,255,0.45)',
                          width: idx === activePhotoIdx ? 18 : 6,
                        },
                      ]}
                    />
                  ))}
                </View>
              )}
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
          {/* PRICE & TYPE SURFACE BLOCK */}
          <View
            style={[
              styles.surfaceCard,
              {
                backgroundColor: c.surface,
                borderRadius: theme.radius.xl,
                ...getCardElevation(theme),
              },
            ]}
          >
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
                    borderRadius: theme.radius.sm,
                  },
                ]}
              >
                <Text style={[styles.catBadgeText, { color: c.textSecondary }]}>
                  {listing.category}
                </Text>
              </View>
            </View>

            <Text style={[styles.price, { color: c.primary }]}>
              {formatListingPrice(listing)}
            </Text>

            {isRent && (listing.security_deposit ?? 0) > 0 && (
              <Text style={[styles.depositText, { color: c.textMuted }]}>
                Refundable Deposit: {formatINR(listing.security_deposit!)}
              </Text>
            )}

            <Text style={[styles.title, { color: c.text }]}>{listing.title}</Text>

            <View style={styles.metaRow}>
              <Ionicons name="location" size={15} color={c.primary} />
              <Text style={[styles.metaText, { color: c.textSecondary }]}>
                {locationLabel || 'Chennai'}
              </Text>
              <Text style={[styles.dotSep, { color: c.textMuted }]}>•</Text>
              <Text style={[styles.metaText, { color: c.textMuted }]}>
                {formatTimeAgo(listing.created_at)}
              </Text>
            </View>
          </View>

          {/* DESCRIPTION CARD */}
          <View
            style={[
              styles.surfaceCard,
              {
                backgroundColor: c.surface,
                borderRadius: theme.radius.xl,
                ...getCardElevation(theme),
              },
            ]}
          >
            <Text style={[styles.sectionHeading, { color: c.text }]}>Description</Text>
            <Text style={[styles.description, { color: c.textSecondary }]}>
              {listing.description || 'No additional description provided by the seller.'}
            </Text>
          </View>

          {/* SELLER CARD */}
          <View
            style={[
              styles.surfaceCard,
              {
                backgroundColor: c.surface,
                borderRadius: theme.radius.xl,
                ...getCardElevation(theme),
              },
            ]}
          >
            <Text style={[styles.sectionHeading, { color: c.text }]}>Seller</Text>
            <View style={styles.sellerRow}>
              <View
                style={[
                  styles.sellerAvatar,
                  { borderColor: c.primary, backgroundColor: c.primaryMuted },
                ]}
              >
                <Text style={[styles.sellerInitial, { color: c.primary }]}>
                  {sellerName[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sellerName, { color: c.text }]}>{sellerName}</Text>
                <View style={styles.sellerLocRow}>
                  <Ionicons name="location-outline" size={13} color={c.textMuted} />
                  <Text style={[styles.sellerSub, { color: c.textMuted }]}>
                    {listing.profiles?.city || listing.city || 'Chennai'}
                  </Text>
                </View>
              </View>
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
            paddingBottom: Math.max(insets.bottom, 14),
            ...getCardElevation(theme),
          },
        ]}
      >
        {isOwner ? (
          <View
            style={[
              styles.ownerBanner,
              {
                backgroundColor: c.surfaceElevated,
                borderRadius: theme.radius.lg,
              },
            ]}
          >
            <Ionicons name="checkmark-circle" size={19} color={c.primary} />
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
                borderRadius: theme.radius.lg,
              },
            ]}
            onPress={handleChatPress}
          >
            <Ionicons name="chatbubble-ellipses" size={20} color={c.primaryText} />
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
  floatingTopBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  floatingIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    maxWidth: '60%',
  },
  floatingPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  scrollContent: {},
  carouselWrap: { width: SCREEN_WIDTH, height: 310 },
  noPhotoBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  noPhotoText: { fontSize: 13, fontWeight: '600' },
  photoCounter: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  photoCounterText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  dotsRow: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  dotIndicator: {
    height: 6,
    borderRadius: 3,
  },
  body: {
    paddingHorizontal: 16,
    marginTop: -12,
    gap: 14,
  },
  surfaceCard: {
    padding: 18,
  },
  tagRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4 },
  typeBadgeText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
  catBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  catBadgeText: { fontSize: 11, fontWeight: '700' },
  price: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  depositText: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  title: { fontSize: 19, fontWeight: '800', marginTop: 8, lineHeight: 26, letterSpacing: -0.2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12 },
  metaText: { fontSize: 13, fontWeight: '600' },
  dotSep: { fontSize: 13 },
  sectionHeading: { fontSize: 15, fontWeight: '800', marginBottom: 8, letterSpacing: -0.2 },
  description: { fontSize: 14, lineHeight: 22, fontWeight: '500' },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sellerAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerInitial: { fontSize: 20, fontWeight: '900' },
  sellerName: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  sellerLocRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  sellerSub: { fontSize: 12, fontWeight: '600' },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
  },
  chatBtnText: { fontSize: 15, fontWeight: '900' },
  ownerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
  },
  ownerBannerText: { fontSize: 14, fontWeight: '800' },
});