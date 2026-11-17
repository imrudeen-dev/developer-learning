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
  ScreenHeader,
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
        style={[
          styles.card,
          {
            backgroundColor: c.surface,
            borderColor: c.border,
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
              {isRent ? 'RENT' : 'BUY'}
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
      {/* HEADER */}
      <ScreenHeader
        title="Becho"
        subtitle="Local Buy & Rent Marketplace"
        leftAction={<BechoLogoMark size={34} />}
        rightAction={
          <View
            style={[
              styles.cityPill,
              {
                backgroundColor: c.surfaceElevated,
                borderColor: c.border,
                borderRadius: theme.radius.full,
              },
            ]}
          >
            <Ionicons name="location" size={13} color={c.primary} />
            <Text style={[styles.cityPillText, { color: c.text }]}>Chennai</Text>
          </View>
        }
      />

      {/* SEARCH BAR */}
      <View
        style={[
          styles.searchBox,
          {
            backgroundColor: c.surface,
            borderColor: c.border,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        <Ionicons name="search-outline" size={18} color={c.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="Search phones, bikes, cameras, rooms..."
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
          >
            <Ionicons name="close-circle" size={18} color={c.textMuted} />
          </HapticButton>
        )}
      </View>

      {/* ALL / BUY / RENT FILTER */}
      <View style={styles.modeRow}>
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
              style={[
                styles.modeBtn,
                {
                  backgroundColor: active ? c.primary : c.surface,
                  borderColor: active ? c.primary : c.border,
                  borderRadius: theme.radius.md,
                },
              ]}
              onPress={() => setTypeFilter(tab.key)}
            >
              <Text
                style={[
                  styles.modeBtnText,
                  { color: active ? c.primaryText : c.textMuted },
                ]}
              >
                {tab.label}
              </Text>
            </HapticButton>
          );
        })}
      </View>

      {/* CATEGORY CHIPS */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
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
                  borderColor: active ? c.primary : c.border,
                  borderRadius: theme.radius.full,
                },
              ]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text
                style={[
                  styles.catChipText,
                  { color: active ? c.primary : c.textMuted },
                ]}
              >
                {cat}
              </Text>
            </HapticButton>
          );
        })}
      </ScrollView>

      {/* FEED LIST */}
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
            { paddingBottom: 32 + insets.bottom },
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
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={44} color={c.textMuted} />
              <Text style={[styles.emptyTitle, { color: c.text }]}>
                No matching ads found
              </Text>
              <Text style={[styles.emptySub, { color: c.textMuted }]}>
                Try clearing filters or be the first to post an ad in this category.
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
  cityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  cityPillText: { fontSize: 12, fontWeight: '700' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 9,
    borderWidth: 1,
    alignItems: 'center',
  },
  modeBtnText: { fontSize: 13, fontWeight: '800' },
  categoryScroll: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  catChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderWidth: 1,
  },
  catChipText: { fontSize: 12, fontWeight: '700' },
  listContent: { paddingHorizontal: 16 },
  columnWrapper: { justifyContent: 'space-between', gap: 12 },
  card: {
    flex: 1,
    maxWidth: '48.5%',
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
  },
  imageWrap: { width: '100%', height: 136 },
  cardImage: { width: '100%', height: '100%' },
  placeholderImage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
  photoCountPill: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  photoCountText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  cardBody: { padding: 11 },
  priceText: { fontSize: 15, fontWeight: '800' },
  titleText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
    lineHeight: 18,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 8 },
  metaText: { fontSize: 11, flex: 1 },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
  },
  categoryTag: { fontSize: 10, flex: 1 },
  timeText: { fontSize: 10 },
  emptyState: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginTop: 12 },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  postShortcutBtn: {
    marginTop: 18,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  postShortcutText: { fontWeight: '800', fontSize: 14 },
});