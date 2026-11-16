import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BECHO_CATEGORIES } from '../../lib/constants';
import { Listing, formatListingPrice, formatTimeAgo } from '../../lib/listings';
import { supabase } from '../../lib/supabase';
import { BECHO_COLORS } from '../../lib/theme';

type TypeFilter = 'ALL' | 'SELL' | 'RENT';

export default function HomeFeedScreen() {
  const router = useRouter();

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

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

        const trimmed = searchQuery.trim();
        if (trimmed) {
          query = query.or(`title.ilike.%${trimmed}%,description.ilike.%${trimmed}%`);
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
    [typeFilter, selectedCategory, searchQuery]
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
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => router.push(`/listing/${item.id}`)}
      >
        <View style={styles.imageWrap}>
          {coverImage ? (
            <Image source={{ uri: coverImage }} style={styles.cardImage} />
          ) : (
            <View style={styles.placeholderImage}>
              <Ionicons name="image-outline" size={30} color={BECHO_COLORS.textMuted} />
            </View>
          )}

          <View
            style={[
              styles.badge,
              isRent ? styles.badgeRent : styles.badgeSell,
            ]}
          >
            <Text style={styles.badgeText}>{isRent ? 'RENT' : 'BUY'}</Text>
          </View>

          {item.images && item.images.length > 1 && (
            <View style={styles.photoCountPill}>
              <Ionicons name="images-outline" size={11} color="#FFF" />
              <Text style={styles.photoCountText}>{item.images.length}</Text>
            </View>
          )}
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.priceText} numberOfLines={1}>
            {formatListingPrice(item)}
          </Text>
          <Text style={styles.titleText} numberOfLines={2}>
            {item.title}
          </Text>

          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={13} color={BECHO_COLORS.textMuted} />
            <Text style={styles.metaText} numberOfLines={1}>
              {locationLabel || 'Chennai'}
            </Text>
          </View>

          <View style={styles.footerRow}>
            <Text style={styles.categoryTag} numberOfLines={1}>
              {item.category}
            </Text>
            <Text style={styles.timeText}>{formatTimeAgo(item.created_at)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>Becho</Text>
          <Text style={styles.tagline}>Local Buy & Rent Marketplace</Text>
        </View>
        <View style={styles.cityPill}>
          <Ionicons name="location" size={14} color={BECHO_COLORS.primary} />
          <Text style={styles.cityPillText}>Chennai</Text>
        </View>
      </View>

      {/* SEARCH BAR */}
      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={18} color={BECHO_COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search phones, bikes, cameras, rooms..."
          placeholderTextColor={BECHO_COLORS.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          onSubmitEditing={() => fetchListings(false)}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={BECHO_COLORS.textMuted} />
          </TouchableOpacity>
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
            <TouchableOpacity
              key={tab.key}
              style={[styles.modeBtn, active && styles.modeBtnActive]}
              onPress={() => setTypeFilter(tab.key)}
            >
              <Text style={[styles.modeBtnText, active && styles.modeBtnTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
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
            <TouchableOpacity
              key={cat}
              style={[styles.catChip, active && styles.catChipActive]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text style={[styles.catChipText, active && styles.catChipTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* FEED LIST */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={BECHO_COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          renderItem={renderListingCard}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchListings(true)}
              tintColor={BECHO_COLORS.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={44} color={BECHO_COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No matching ads found</Text>
              <Text style={styles.emptySub}>
                Try clearing filters or be the first to post an ad in this category.
              </Text>
              <TouchableOpacity
                style={styles.postShortcutBtn}
                onPress={() => router.push('/(tabs)/post')}
              >
                <Text style={styles.postShortcutText}>Post an Ad</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BECHO_COLORS.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  brand: { color: BECHO_COLORS.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  tagline: { color: BECHO_COLORS.textMuted, fontSize: 12 },
  cityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: BECHO_COLORS.surface,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  cityPillText: { color: BECHO_COLORS.text, fontSize: 12, fontWeight: '700' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BECHO_COLORS.surface,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
    borderRadius: 12,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, color: BECHO_COLORS.text, fontSize: 14, padding: 0 },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: BECHO_COLORS.surface,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: BECHO_COLORS.primary,
    borderColor: BECHO_COLORS.primary,
  },
  modeBtnText: { color: BECHO_COLORS.textMuted, fontSize: 13, fontWeight: '700' },
  modeBtnTextActive: { color: '#052E16', fontWeight: '800' },
  categoryScroll: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: BECHO_COLORS.surface,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
  },
  catChipActive: {
    backgroundColor: BECHO_COLORS.primaryMuted,
    borderColor: BECHO_COLORS.primary,
  },
  catChipText: { color: BECHO_COLORS.textMuted, fontSize: 12, fontWeight: '600' },
  catChipTextActive: { color: BECHO_COLORS.primary, fontWeight: '700' },
  listContent: { paddingHorizontal: 16, paddingBottom: 28 },
  columnWrapper: { justifyContent: 'space-between', gap: 12 },
  card: {
    flex: 1,
    maxWidth: '48.5%',
    backgroundColor: BECHO_COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BECHO_COLORS.border,
    overflow: 'hidden',
    marginBottom: 12,
  },
  imageWrap: { width: '100%', height: 132, backgroundColor: BECHO_COLORS.surfaceElevated },
  cardImage: { width: '100%', height: '100%' },
  placeholderImage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeSell: { backgroundColor: BECHO_COLORS.primary },
  badgeRent: { backgroundColor: BECHO_COLORS.rentBadge },
  badgeText: { color: '#052E16', fontSize: 10, fontWeight: '900' },
  photoCountPill: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  photoCountText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  cardBody: { padding: 10 },
  priceText: { color: BECHO_COLORS.primary, fontSize: 15, fontWeight: '800' },
  titleText: {
    color: BECHO_COLORS.text,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
    lineHeight: 18,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 8 },
  metaText: { color: BECHO_COLORS.textMuted, fontSize: 11, flex: 1 },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: BECHO_COLORS.border,
  },
  categoryTag: { color: BECHO_COLORS.textMuted, fontSize: 10, flex: 1 },
  timeText: { color: BECHO_COLORS.textMuted, fontSize: 10 },
  emptyState: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 24 },
  emptyTitle: { color: BECHO_COLORS.text, fontSize: 17, fontWeight: '700', marginTop: 12 },
  emptySub: {
    color: BECHO_COLORS.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  postShortcutBtn: {
    marginTop: 18,
    backgroundColor: BECHO_COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 10,
  },
  postShortcutText: { color: '#052E16', fontWeight: '800', fontSize: 14 },
});