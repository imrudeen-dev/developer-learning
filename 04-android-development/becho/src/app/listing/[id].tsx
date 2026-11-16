import { Ionicons } from '@expo/vector-icons';
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
    TouchableOpacity,
    View,
} from 'react-native';
import { useAuth } from '../../lib/auth-context';
import { Listing, formatINR, formatListingPrice, formatTimeAgo } from '../../lib/listings';
import { supabase } from '../../lib/supabase';
import { BECHO_COLORS } from '../../lib/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

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
  }, [id]);

  if (loading || !listing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={BECHO_COLORS.primary} />
      </View>
    );
  }

  const isOwner = user?.id === listing.seller_id;
  const isRent = listing.listing_type === 'RENT';
  const locationLabel = [listing.locality, listing.city].filter(Boolean).join(', ');
  const sellerName = listing.profiles?.full_name || 'Becho Seller';

  const handleChatPress = () => {
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
    <View style={styles.screen}>
      {/* TOP BAR */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={BECHO_COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          Ad Details
        </Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* PHOTO CAROUSEL */}
        <View style={styles.carouselWrap}>
          {listing.images && listing.images.length > 0 ? (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
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
              <View style={styles.photoCounter}>
                <Text style={styles.photoCounterText}>
                  {activePhotoIdx + 1} / {listing.images.length}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.noPhotoBox}>
              <Ionicons name="image-outline" size={48} color={BECHO_COLORS.textMuted} />
              <Text style={styles.noPhotoText}>No photos provided</Text>
            </View>
          )}
        </View>

        {/* MAIN DETAILS */}
        <View style={styles.body}>
          <View style={styles.tagRow}>
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: isRent ? BECHO_COLORS.rentBadge : BECHO_COLORS.primary },
              ]}
            >
              <Text style={styles.typeBadgeText}>{isRent ? 'FOR RENT' : 'FOR SALE'}</Text>
            </View>
            <View style={styles.catBadge}>
              <Text style={styles.catBadgeText}>{listing.category}</Text>
            </View>
          </View>

          <Text style={styles.price}>{formatListingPrice(listing)}</Text>

          {isRent && (listing.security_deposit ?? 0) > 0 && (
            <Text style={styles.depositText}>
              Security Deposit: {formatINR(listing.security_deposit!)}
            </Text>
          )}

          <Text style={styles.title}>{listing.title}</Text>

          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={16} color={BECHO_COLORS.primary} />
            <Text style={styles.metaText}>{locationLabel || 'Chennai'}</Text>
            <Text style={styles.dot}>•</Text>
            <Text style={styles.metaText}>{formatTimeAgo(listing.created_at)}</Text>
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionHeading}>Description</Text>
          <Text style={styles.description}>
            {listing.description || 'No additional description provided by the seller.'}
          </Text>

          <View style={styles.divider} />

          {/* SELLER CARD */}
          <Text style={styles.sectionHeading}>Seller</Text>
          <View style={styles.sellerCard}>
            <View style={styles.sellerAvatar}>
              <Text style={styles.sellerInitial}>{sellerName[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sellerName}>{sellerName}</Text>
              <Text style={styles.sellerSub}>
                {listing.profiles?.city || listing.city || 'Chennai'}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* BOTTOM ACTION BAR */}
      <View style={styles.bottomBar}>
        {isOwner ? (
          <View style={styles.ownerBanner}>
            <Ionicons name="checkmark-circle" size={18} color={BECHO_COLORS.primary} />
            <Text style={styles.ownerBannerText}>You published this listing</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.chatBtn} onPress={handleChatPress}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color="#052E16" />
            <Text style={styles.chatBtnText}>Chat with Seller</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BECHO_COLORS.bg },
  centered: { flex: 1, backgroundColor: BECHO_COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
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
  topBarTitle: { color: BECHO_COLORS.text, fontSize: 16, fontWeight: '700', maxWidth: '70%' },
  scrollContent: { paddingBottom: 96 },
  carouselWrap: { width: SCREEN_WIDTH, height: 280, backgroundColor: BECHO_COLORS.surfaceElevated },
  noPhotoBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  noPhotoText: { color: BECHO_COLORS.textMuted, fontSize: 13 },
  photoCounter: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  photoCounterText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  body: { padding: 16 },
  tagRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  typeBadgeText: { color: '#052E16', fontSize: 11, fontWeight: '900' },
  catBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: BECHO_COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
  },
  catBadgeText: { color: BECHO_COLORS.textMuted, fontSize: 11, fontWeight: '700' },
  price: { color: BECHO_COLORS.primary, fontSize: 26, fontWeight: '900' },
  depositText: { color: BECHO_COLORS.textMuted, fontSize: 13, marginTop: 4 },
  title: { color: BECHO_COLORS.text, fontSize: 19, fontWeight: '700', marginTop: 8, lineHeight: 25 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  metaText: { color: BECHO_COLORS.textMuted, fontSize: 13 },
  dot: { color: BECHO_COLORS.textMuted },
  divider: { height: 1, backgroundColor: BECHO_COLORS.border, marginVertical: 18 },
  sectionHeading: { color: BECHO_COLORS.text, fontSize: 15, fontWeight: '700', marginBottom: 8 },
  description: { color: BECHO_COLORS.text, fontSize: 14, lineHeight: 22, opacity: 0.9 },
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: BECHO_COLORS.surface,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
    padding: 14,
    borderRadius: 14,
  },
  sellerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: BECHO_COLORS.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerInitial: { color: BECHO_COLORS.primary, fontSize: 18, fontWeight: '800' },
  sellerName: { color: BECHO_COLORS.text, fontSize: 15, fontWeight: '700' },
  sellerSub: { color: BECHO_COLORS.textMuted, fontSize: 12, marginTop: 2 },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 14,
    backgroundColor: BECHO_COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: BECHO_COLORS.border,
  },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BECHO_COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
  },
  chatBtnText: { color: '#052E16', fontSize: 15, fontWeight: '800' },
  ownerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: BECHO_COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
  },
  ownerBannerText: { color: BECHO_COLORS.text, fontSize: 14, fontWeight: '700' },
});