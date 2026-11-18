import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BechoLogoMark,
  HapticButton,
  ListingSkeletonGrid,
} from '../../components/NativeUI';
import { BECHO_CATEGORIES } from '../../lib/constants';
import { Listing, formatListingPrice, formatTimeAgo } from '../../lib/listings';
import { supabase } from '../../lib/supabase';
import { getCardElevation, useBechoTheme } from '../../lib/theme';

type TypeFilter = 'ALL' | 'SELL' | 'RENT';

export default function HomeFeedScreen() {
  const router = useRouter();
  const { theme } = useBechoTheme();
  const insets = useSafeAreaInsets();
  const c = theme.colors;

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchListings = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        let query = supabase
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
          .eq('status', 'ACTIVE')
          .order('created_at', { ascending: false });

        if (typeFilter !== 'ALL') {
          query = query.eq('listing_type', typeFilter);
        }

        if (selectedCategory !== 'All') {
          query = query.eq('category', selectedCategory);
        }

        if (debouncedQuery) {
          query = query.or(
            `title.ilike.%${debouncedQuery}%,description.ilike.%${debouncedQuery}%`
          );
        }

        const { data, error } = await query;
        if (error) throw error;
        setListings((data as unknown as Listing[]) ?? []);
      } catch (err) {
        console.error('[Becho] Failed to load listings:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [typeFilter, selectedCategory, debouncedQuery]
  );

  useFocusEffect(
    useCallback(() => {
      fetchListings(false);
    }, [fetchListings])
  );

  const renderListingCard = ({ item }: { item: Listing }) => {
    const coverImage = item.images?.[0];
    const isRent = item.listing_type === 'RENT';
    const locationLabel = [item.locality, item.city].filter(Boolean).join(', ');

    return (
      <HapticButton
        hapticStyle="light"
        scaleTo={0.97}
        style={[
          styles.card,
          {
            backgroundColor: c.surface,
            borderRadius: theme.radius.lg,
            ...getCardElevation(theme),
          },
        ]}
        onPress={() => router.push(`/listing/${item.id}`)}
      >
        <View style={[styles.imageWrap, { backgroundColor: c.surfaceElevated }]}>
          {coverImage ? (
            <Image source={{ uri: coverImage }} style={styles.cardImage} />
          ) : (
            <View style={styles.placeholderImage}>
              <Ionicons name="image-outline" size={30} color={c.textMuted} />
            </View>
          )}

          <View
            style={[
              styles.badge,
              {
                backgroundColor: isRent ? c.rentBadge : c.sellBadge,
                borderRadius: theme.radius.sm,
              },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                { color: isRent ? c.rentText : c.sellText },
              ]}
            >
              {isRent ? 'FOR RENT' : 'FOR SALE'}
            </Text>
          </View>

          {item.images && item.images.length > 1 && (
            <View style={[styles.photoCountPill, { backgroundColor: c.overlay }]}>
              <Ionicons name="images-outline" size={11} color="#FFF" />
              <Text style={styles.photoCountText}>{item.images.length}</Text>
            </View>
          )}
        </View>

        <View style={styles.cardBody}>
          <Text style={[styles.priceText, { color: c.primary }]} numberOfLines={1}>
            {formatListingPrice(item)}
          </Text>
          <Text style={[styles.titleText, { color: c.text }]} numberOfLines={2}>
            {item.title}
          </Text>

          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={13} color={c.textMuted} />
            <Text style={[styles.metaText, { color: c.textMuted }]} numberOfLines={1}>
              {locationLabel || 'Chennai'}
            </Text>
          </View>

          <View style={[styles.footerRow, { borderTopColor: c.border }]}>
            <Text style={[styles.categoryTag, { color: c.textMuted }]} numberOfLines={1}>
              {item.category}
            </Text>
            <Text style={[styles.timeText, { color: c.textMuted }]}>
              {formatTimeAgo(item.created_at)}
            </Text>
          </View>
        </View>
      </HapticButton>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      {/* TOP BRAND & ACTION BAR */}
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <BechoLogoMark size={38} />
          <View>
            <Text style={[styles.brandTitle, { color: c.text }]}>Becho</Text>
            <View style={styles.locationSubRow}>
              <Ionicons name="location" size={12} color={c.primary} />
              <Text style={[styles.locationSubText, { color: c.textMuted }]}>
                Chennai Marketplace
              </Text>
            </View>
          </View>
        </View>

        <HapticButton
          hapticStyle="medium"
          style={[
            styles.postPill,
            {
              backgroundColor: c.primary,
              borderRadius: theme.radius.full,
              ...getCardElevation(theme),
            },
          ]}
          onPress={() => router.push('/(tabs)/post')}
        >
          <Ionicons name="add" size={17} color={c.primaryText} />
          <Text style={[styles.postPillText, { color: c.primaryText }]}>Post Ad</Text>
        </HapticButton>
      </View>

      {/* NATIVE FILLED SEARCH BAR */}
      <View
        style={[
          styles.searchBox,
          {
            backgroundColor: c.surface,
            borderRadius: theme.radius.lg,
            ...getCardElevation(theme),
          },
        ]}
      >
        <Ionicons name="search" size={19} color={c.primary} />
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="Search phones, bikes, cameras, rentals..."
          placeholderTextColor={c.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          onSubmitEditing={() => fetchListings(false)}
        />
        {searchQuery.length > 0 && (
          <HapticButton
            hapticStyle="selection"
            onPress={() => setSearchQuery('')}
            style={styles.clearBtn}
          >
            <Ionicons name="close-circle" size={18} color={c.textMuted} />
          </HapticButton>
        )}
      </View>

      {/* SEGMENTED BUY / RENT / ALL SWITCHER */}
      <View
        style={[
          styles.segmentTrack,
          {
            backgroundColor: c.surface,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        {(
          [
            { key: 'ALL', label: 'All Ads' },
            { key: 'SELL', label: 'Buy' },
            { key: 'RENT', label: 'Rent' },
          ] as const
        ).map((tab) => {
          const active = typeFilter === tab.key;
          return (
            <HapticButton
              key={tab.key}
              hapticStyle="selection"
              scaleTo={0.98}
              style={[
                styles.segmentBtn,
                {
                  backgroundColor: active ? c.primary : 'transparent',
                  borderRadius: theme.radius.md,
                },
              ]}
              onPress={() => setTypeFilter(tab.key)}
            >
              <Text
                style={[
                  styles.segmentText,
                  { color: active ? c.primaryText : c.textMuted },
                ]}
              >
                {tab.label}
              </Text>
            </HapticButton>
          );
        })}
      </View>

      {/* HORIZONTAL CATEGORY CHIPS */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScrollView}
        contentContainerStyle={styles.categoryScroll}
      >
        {['All', ...BECHO_CATEGORIES].map((cat) => {
          const active = selectedCategory === cat;
          return (
            <HapticButton
              key={cat}
              hapticStyle="selection"
              style={[
                styles.catChip,
                {
                  backgroundColor: active ? c.primaryMuted : c.surface,
                  borderRadius: theme.radius.full,
                },
              ]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text
                style={[
                  styles.catChipText,
                  { color: active ? c.primary : c.textSecondary },
                ]}
              >
                {cat}
              </Text>
            </HapticButton>
          );
        })}
      </ScrollView>

      {/* LISTING FEED */}
      {loading && listings.length === 0 ? (
        <ListingSkeletonGrid />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          renderItem={renderListingCard}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: 96 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchListings(true)}
              tintColor={c.primary}
              colors={[c.primary]}
              progressBackgroundColor={c.surface}
            />
          }
          ListEmptyComponent={
            <View
              style={[
                styles.emptyState,
                {
                  backgroundColor: c.surface,
                  borderRadius: theme.radius.xl,
                },
              ]}
            >
              <View style={[styles.emptyIconCircle, { backgroundColor: c.primaryMuted }]}>
                <Ionicons name="sparkles-outline" size={32} color={c.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: c.text }]}>
                No matching ads yet
              </Text>
              <Text style={[styles.emptySub, { color: c.textMuted }]}>
                Clear active filters or list the first item in this category.
              </Text>
              <HapticButton
                hapticStyle="medium"
                style={[
                  styles.postShortcutBtn,
                  {
                    backgroundColor: c.primary,
                    borderRadius: theme.radius.md,
                  },
                ]}
                onPress={() => router.push('/(tabs)/post')}
              >
                <Text style={[styles.postShortcutText, { color: c.primaryText }]}>
                  Post an Ad
                </Text>
              </HapticButton>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  brandTitle: {
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  locationSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
  },
  locationSubText: {
    fontSize: 12,
    fontWeight: '600',
  },
  postPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  postPillText: {
    fontSize: 13,
    fontWeight: '800',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    padding: 0,
  },
  clearBtn: {
    padding: 2,
  },
  segmentTrack: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '800',
  },
  categoryScrollView: {
    flexGrow: 0,
    flexShrink: 0,
  },
  categoryScroll: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    alignItems: 'flex-start',
  },
  catChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  catChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 2,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    gap: 12,
  },
  card: {
    flex: 1,
    maxWidth: '48.5%',
    overflow: 'hidden',
    marginBottom: 14,
  },
  imageWrap: {
    width: '100%',
    height: 142,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  placeholderImage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 9,
    left: 9,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  photoCountPill: {
    position: 'absolute',
    bottom: 9,
    right: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  photoCountText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  cardBody: {
    padding: 12,
  },
  priceText: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  titleText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  metaText: {
    fontSize: 11,
    flex: 1,
    fontWeight: '500',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 9,
    paddingTop: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  categoryTag: {
    fontSize: 10,
    flex: 1,
    fontWeight: '600',
  },
  timeText: {
    fontSize: 10,
    fontWeight: '500',
  },
  emptyState: {
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
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginTop: 14,
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  postShortcutBtn: {
    marginTop: 18,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  postShortcutText: {
    fontWeight: '800',
    fontSize: 14,
  },
});