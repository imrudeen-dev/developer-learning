import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  Share,
  Switch,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from '../../components/app-text';
import { useAppPreferences, type TranslationKey } from '../../lib/app-preferences';
import { useAuth } from '../../lib/auth-context';
import { BECHO_CATEGORIES } from '../../lib/constants';
import { formatListingPrice, formatTimeAgo, Listing } from '../../lib/listings';
import {
  getLikedListingIds,
  getListingMetrics,
  getSavedListingIds,
  ListingMetrics,
  setListingLiked,
  setListingSaved,
} from '../../lib/marketplace';
import { usePlatformSettings } from '../../lib/platform-settings';
import { supabase } from '../../lib/supabase';
import { BECHO_COLORS } from '../../lib/theme';
import { TourTarget } from '../../lib/tour-context';

type TypeFilter = 'ALL' | 'SELL' | 'RENT';
type ListingSort = 'newest' | 'price_asc' | 'price_desc';
type ListingWithMetrics = Listing & { metrics?: ListingMetrics };

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Mobiles: 'phone-portrait-outline',
  Electronics: 'laptop-outline',
  Vehicles: 'car-sport-outline',
  Property: 'home-outline',
  Furniture: 'bed-outline',
  Bikes: 'bicycle-outline',
  Appliances: 'tv-outline',
  Fashion: 'shirt-outline',
  'Books & Sports': 'book-outline',
  'Tools & Gear': 'hammer-outline',
};
const CATEGORY_TRANSLATION_KEYS: Record<string, TranslationKey> = {
  Mobiles: 'categoryMobiles',
  Electronics: 'categoryElectronics',
  Vehicles: 'categoryVehicles',
  Property: 'categoryProperty',
  Furniture: 'categoryFurniture',
  Bikes: 'categoryBikes',
  Appliances: 'categoryAppliances',
  Fashion: 'categoryFashion',
  'Books & Sports': 'categoryBooksSports',
  'Tools & Gear': 'categoryToolsGear',
};

interface FeedAnnouncement {
  id: string;
  title: string;
  body: string;
  severity: 'info' | 'success' | 'warning' | 'urgent';
  ends_at: string | null;
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { theme, t } = useAppPreferences();
  const { settings, error: settingsError } = usePlatformSettings();
  const [listings, setListings] = useState<ListingWithMetrics[]>([]);
  const [soldListings, setSoldListings] = useState<Listing[]>([]);
  const [metrics, setMetrics] = useState<Map<string, ListingMetrics>>(new Map());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [featureMessage, setFeatureMessage] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<ListingSort>('newest');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showMorePopular, setShowMorePopular] = useState(false);
  const [showMoreRecommended, setShowMoreRecommended] = useState(false);
  const [showMoreSold, setShowMoreSold] = useState(false);
  const [gridView, setGridView] = useState(true);
  const [announcement, setAnnouncement] = useState<FeedAnnouncement | null>(null);
  const [dismissedAnnouncementId, setDismissedAnnouncementId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    let active = true;
    const loadAnnouncement = async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('id, title, body, severity, ends_at')
        .eq('is_active', true)
        .lte('starts_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) {
        console.error('[Becho] Could not load marketplace announcements:', error);
        return;
      }

      const now = Date.now();
      const current = (data ?? []).find(
        (item) => !item.ends_at || new Date(item.ends_at).getTime() > now
      );
      if (!active) return;
      if (!current) {
        setAnnouncement(null);
        return;
      }
      setAnnouncement({
        id: String(current.id),
        title: String(current.title),
        body: String(current.body),
        severity:
          current.severity === 'success' ||
          current.severity === 'warning' ||
          current.severity === 'urgent'
            ? current.severity
            : 'info',
        ends_at: current.ends_at ? String(current.ends_at) : null,
      });
    };

    void loadAnnouncement();
    const channelTopic = [
      'marketplace-announcements',
      Date.now(),
      Math.random().toString(36).slice(2, 9),
    ].join(':');
    const channel = supabase
      .channel(channelTopic)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
        void loadAnnouncement();
      })
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  const fetchListings = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setErrorMessage('');

      try {
        let query = supabase
          .from('listings')
          .select(
            `id, seller_id, title, description, listing_type, category, price, rent_period,
             security_deposit, city, locality, latitude, longitude, images, status, created_at,
             profiles:seller_id (full_name, city)`
          )
          .eq('status', 'ACTIVE')
          .order('created_at', { ascending: false })
          .limit(100);

        let soldQuery = supabase
          .from('listings')
          .select(
            `id, seller_id, title, description, listing_type, category, price, rent_period,
             security_deposit, city, locality, latitude, longitude, images, status, created_at,
             profiles:seller_id (full_name, city)`
          )
          .eq('status', 'SOLD')
          .order('created_at', { ascending: false })
          .limit(12);

        if (typeFilter !== 'ALL') query = query.eq('listing_type', typeFilter);
        if (selectedCategory !== 'All') {
          query = query.eq('category', selectedCategory);
          soldQuery = soldQuery.eq('category', selectedCategory);
        }
        if (typeFilter !== 'ALL') soldQuery = soldQuery.eq('listing_type', typeFilter);
        if (minPrice.trim()) {
          query = query.gte('price', Number(minPrice));
          soldQuery = soldQuery.gte('price', Number(minPrice));
        }
        if (maxPrice.trim()) {
          query = query.lte('price', Number(maxPrice));
          soldQuery = soldQuery.lte('price', Number(maxPrice));
        }
        if (cityFilter.trim()) {
          query = query.ilike('city', `%${cityFilter.trim()}%`);
          soldQuery = soldQuery.ilike('city', `%${cityFilter.trim()}%`);
        }

        const [activeResult, soldResult] = await Promise.all([query, soldQuery]);
        if (activeResult.error) throw activeResult.error;
        if (soldResult.error) {
          console.error('[Becho] Could not load sold listings:', soldResult.error);
          setFeatureMessage('Recently sold listings are unavailable with the current database policies.');
        }

        const search = debouncedQuery.toLocaleLowerCase();
        const rows = ((activeResult.data ?? []) as unknown as Listing[]).filter((listing) => {
          if (!search) return true;
          return `${listing.title} ${listing.description ?? ''} ${listing.category}`
            .toLocaleLowerCase()
            .includes(search);
        });
        const soldRows = ((soldResult.data ?? []) as unknown as Listing[]).filter((listing) => {
          if (!search) return true;
          return `${listing.title} ${listing.description ?? ''} ${listing.category}`
            .toLocaleLowerCase()
            .includes(search);
        });
        setListings(rows);
        setSoldListings(soldRows);

        try {
          const nextMetrics = await getListingMetrics([
            ...rows.map((listing) => listing.id),
            ...soldRows.map((listing) => listing.id),
          ]);
          setMetrics(nextMetrics);
          if (!soldResult.error) setFeatureMessage('');
        } catch (metricsError) {
          console.error('[Becho] Could not load listing metrics:', metricsError);
          setFeatureMessage('Likes, views, and seller ratings need the latest database migration.');
        }
      } catch (loadError) {
        console.error('[Becho] Failed to load marketplace listings:', loadError);
        const detail =
          loadError && typeof loadError === 'object' && 'message' in loadError
            ? String((loadError as { message?: string }).message)
            : loadError instanceof Error
              ? loadError.message
              : '';
        setErrorMessage(
          detail ? `${t('listingsLoadError')} — ${detail}` : t('listingsLoadError')
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [typeFilter, selectedCategory, minPrice, maxPrice, cityFilter, debouncedQuery, t]
  );

  useFocusEffect(
    useCallback(() => {
      void fetchListings();
    }, [fetchListings])
  );

  const activeListingIds = useMemo(
    () => new Set([...listings, ...soldListings].map((listing) => listing.id)),
    [listings, soldListings]
  );
  const activeListingIdsRef = useRef(activeListingIds);
  const hasActiveListings = activeListingIds.size > 0;

  useEffect(() => {
    activeListingIdsRef.current = activeListingIds;
  }, [activeListingIds]);

  useEffect(() => {
    if (!hasActiveListings) return;

    const queuedListingIds = new Set<string>();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const channelTopic = [
      'listing-activity-feed',
      Date.now(),
      Math.random().toString(36).slice(2, 9),
    ].join(':');
    const channel = supabase
      .channel(channelTopic)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'listing_activity_counts',
        },
        (payload) => {
          const current = payload.new as { listing_id?: string } | null;
          const previous = payload.old as { listing_id?: string } | null;
          const listingId = current?.listing_id ?? previous?.listing_id;
          if (!listingId || !activeListingIdsRef.current.has(listingId)) return;

          queuedListingIds.add(listingId);
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => {
            const changedIds = Array.from(queuedListingIds);
            queuedListingIds.clear();
            void getListingMetrics(changedIds)
              .then((updatedMetrics) => {
                setMetrics((currentMetrics) => {
                  const next = new Map(currentMetrics);
                  updatedMetrics.forEach((value, key) => next.set(key, value));
                  return next;
                });
              })
              .catch((metricsError: unknown) => {
                console.error('[Becho] Could not refresh live listing activity:', metricsError);
                setFeatureMessage('Live listing activity is temporarily unavailable.');
              });
          }, 120);
        }
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [hasActiveListings]);

  useEffect(() => {
    let active = true;
    if (!user) {
      setSavedIds(new Set());
      setLikedIds(new Set());
      return;
    }

    void Promise.all([getSavedListingIds(user.id), getLikedListingIds(user.id)])
      .then(([saved, liked]) => {
        if (active) {
          setSavedIds(saved);
          setLikedIds(liked);
          setFeatureMessage('');
        }
      })
      .catch((loadError: unknown) => {
        console.error('[Becho] Could not load saved listings or likes:', loadError);
        if (active) {
          setFeatureMessage('Saved items and likes need the latest database migration.');
        }
      });

    return () => {
      active = false;
    };
  }, [user]);

  const displayListings = useMemo(() => {
    const filtered = verifiedOnly
      ? listings.filter((listing) => metrics.get(listing.id)?.is_verified)
      : listings;
    return [...filtered].sort((a, b) => {
      if (sortOrder === 'price_asc') return a.price - b.price;
      if (sortOrder === 'price_desc') return b.price - a.price;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [listings, metrics, sortOrder, verifiedOnly]);

  const popularListings = useMemo(
    () =>
      [...listings]
        .filter((listing) => !verifiedOnly || metrics.get(listing.id)?.is_verified)
        .sort(
        (a, b) =>
          (metrics.get(b.id)?.like_count ?? 0) - (metrics.get(a.id)?.like_count ?? 0) ||
          (metrics.get(b.id)?.view_count ?? 0) - (metrics.get(a.id)?.view_count ?? 0)
        ),
    [listings, metrics, verifiedOnly]
  );
  const recommendedListings = useMemo(
    () =>
      [...listings]
        .filter((listing) => !verifiedOnly || metrics.get(listing.id)?.is_verified)
        .sort((a, b) => {
          const aMetrics = metrics.get(a.id);
          const bMetrics = metrics.get(b.id);
          const aScore = (aMetrics?.average_rating ?? 0) * 10 +
            (aMetrics?.like_count ?? 0) * 0.5 +
            (aMetrics?.view_count ?? 0) * 0.1;
          const bScore = (bMetrics?.average_rating ?? 0) * 10 +
            (bMetrics?.like_count ?? 0) * 0.5 +
            (bMetrics?.view_count ?? 0) * 0.1;
          return bScore - aScore;
        }),
    [listings, metrics, verifiedOnly]
  );

  const toggleSave = async (listingId: string) => {
    if (!user) {
      router.push('/(tabs)/profile');
      return;
    }
    const wasSaved = savedIds.has(listingId);
    setSavedIds((current) => {
      const next = new Set(current);
      if (wasSaved) next.delete(listingId);
      else next.add(listingId);
      return next;
    });
    try {
      await setListingSaved(user.id, listingId, !wasSaved);
    } catch (saveError) {
      console.error('[Becho] Could not update saved listing:', saveError);
      setFeatureMessage('Could not save this listing. Check that the database migration is applied.');
      setSavedIds((current) => {
        const next = new Set(current);
        if (wasSaved) next.add(listingId);
        else next.delete(listingId);
        return next;
      });
    }
  };

  const toggleLike = async (listingId: string) => {
    if (!user) {
      router.push('/(tabs)/profile');
      return;
    }
    const wasLiked = likedIds.has(listingId);
    setLikedIds((current) => {
      const next = new Set(current);
      if (wasLiked) next.delete(listingId);
      else next.add(listingId);
      return next;
    });
    try {
      await setListingLiked(user.id, listingId, !wasLiked);
      const updatedMetrics = await getListingMetrics([listingId]);
      setMetrics((current) => {
        const next = new Map(current);
        const updated = updatedMetrics.get(listingId);
        if (updated) next.set(listingId, updated);
        return next;
      });
    } catch (likeError) {
      console.error('[Becho] Could not update listing like:', likeError);
      setFeatureMessage('Could not update your like. Check that the database migration is applied.');
      setLikedIds((current) => {
        const next = new Set(current);
        if (wasLiked) next.add(listingId);
        else next.delete(listingId);
        return next;
      });
    }
  };

  const shareListing = async (listing: Listing) => {
    try {
      await Share.share({
        title: listing.title,
        message: `${listing.title} — ${formatListingPrice(listing)}\nbecho://listing/${listing.id}`,
      });
    } catch (shareError) {
      console.error('[Becho] Could not share listing:', shareError);
    }
  };

  const openChat = (listing: Listing) => {
    if (!user) {
      router.push('/(tabs)/profile');
      return;
    }
    if (listing.seller_id === user.id) {
      Alert.alert('Your listing', 'Use a separate buyer account to start a conversation about this item.');
      return;
    }
    router.push({
      pathname: '/chat/[listingId]',
      params: { listingId: listing.id, sellerId: listing.seller_id, title: listing.title },
    });
  };

  const renderCard = (listing: Listing, compact = false) => {
    const itemMetrics = metrics.get(listing.id);
    const imageUri = listing.images?.[0];
    const isSaved = savedIds.has(listing.id);
    const isLiked = likedIds.has(listing.id);
    const isOwner = user?.id === listing.seller_id;

    return (
      <View
        key={listing.id}
        className={`overflow-hidden rounded-2xl border ${
          compact ? 'mr-3 w-52' : gridView ? 'mb-3 flex-1' : 'mb-3 flex-row'
        }`}
        style={{ backgroundColor: theme.surface, borderColor: theme.border }}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={`View ${listing.title}`}
          onPress={() => router.push(`/listing/${listing.id}`)}
        >
          <View className={`${compact ? 'h-28' : gridView ? 'h-36' : 'h-28 w-28'} bg-[#1f2937]`}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} className="h-full w-full" resizeMode="cover" />
            ) : (
              <View className="h-full w-full items-center justify-center">
                <Ionicons name="image-outline" size={30} color={BECHO_COLORS.textMuted} />
              </View>
            )}
            <View className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1">
              <Text className="text-[10px] font-bold text-white">
                {listing.status === 'SOLD'
                  ? t('sold')
                  : listing.status === 'RENTED'
                    ? t('rented')
                    : listing.listing_type === 'RENT'
                      ? t('rent')
                      : t('forSale')}
              </Text>
            </View>
            {itemMetrics?.is_verified && (
              <View className="absolute bottom-2 left-2 flex-row items-center rounded-full bg-emerald-500 px-2 py-1">
                <Ionicons name="checkmark-circle" size={12} color="#052e16" />
                <Text className="ml-1 text-[10px] font-bold text-[#052e16]">{t('verified')}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        <View className={`flex-1 p-3 ${!gridView && !compact ? 'justify-center' : ''}`}>
          <View className="flex-row items-start justify-between">
            <Text className="flex-1 text-base font-extrabold" style={{ color: theme.primary }} numberOfLines={1}>
              {formatListingPrice(listing)}
            </Text>
            <TouchableOpacity
              onPress={() => void toggleSave(listing.id)}
              accessibilityRole="button"
              accessibilityLabel={isSaved ? 'Remove from saved listings' : 'Save listing'}
              hitSlop={8}
            >
              <Ionicons
                name={isSaved ? 'bookmark' : 'bookmark-outline'}
                size={19}
                color={isSaved ? BECHO_COLORS.primary : BECHO_COLORS.textMuted}
              />
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => router.push(`/listing/${listing.id}`)}>
            <Text className="mt-1 text-sm font-semibold text-white" numberOfLines={2}>
              {listing.title}
            </Text>
            <Text className="mt-1 text-xs text-gray-400" numberOfLines={1}>
              {listing.locality ? `${listing.locality}, ` : ''}{listing.city} · {listing.category}
            </Text>
          </TouchableOpacity>

          <View className="mt-3 flex-row items-center justify-between border-t border-white/10 pt-2">
            <View className="flex-row items-center">
              <TouchableOpacity
                onPress={() => void toggleLike(listing.id)}
                accessibilityRole="button"
                accessibilityLabel={isLiked ? 'Unlike listing' : 'Like listing'}
                hitSlop={8}
              >
                <Ionicons
                  name={isLiked ? 'heart' : 'heart-outline'}
                  size={17}
                  color={isLiked ? '#f87171' : BECHO_COLORS.textMuted}
                />
              </TouchableOpacity>
              <Text className="ml-1 mr-3 text-[11px] text-gray-400">
                {itemMetrics?.like_count ?? 0}
              </Text>
              <Ionicons name="eye-outline" size={15} color={BECHO_COLORS.textMuted} />
              <Text className="ml-1 text-[11px] text-gray-400">
                {itemMetrics?.view_count ?? 0}
              </Text>
            </View>
            <View className="flex-row items-center">
              {itemMetrics?.review_count ? (
                <>
                  <Ionicons name="star" size={13} color="#fbbf24" />
                  <Text className="ml-1 text-[11px] text-gray-300">
                    {itemMetrics.average_rating.toFixed(1)}
                  </Text>
                </>
              ) : (
                <Text className="text-[10px] text-gray-500">{formatTimeAgo(listing.created_at)}</Text>
              )}
            </View>
          </View>
          {!compact && (
            <View className="mt-2 flex-row">
              {settings.chat_enabled && listing.status === 'ACTIVE' && !isOwner && (
                <TouchableOpacity
                  onPress={() => openChat(listing)}
                  className="mr-2 flex-1 flex-row items-center justify-center rounded-lg bg-emerald-500 py-2"
                  accessibilityRole="button"
                  accessibilityLabel={`Chat about ${listing.title}`}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={15} color="#052e16" />
                  <Text className="ml-1 text-xs font-bold text-[#052e16]">Chat</Text>
                </TouchableOpacity>
              )}
              {isOwner && listing.status === 'ACTIVE' && (
                <View className="mr-2 flex-1 flex-row items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 py-2">
                  <Ionicons name="storefront-outline" size={14} color={BECHO_COLORS.primary} />
                  <Text className="ml-1 text-xs font-semibold text-emerald-300">Your listing</Text>
                </View>
              )}
              {listing.status !== 'ACTIVE' && (
                <View className="mr-2 flex-1 items-center justify-center rounded-lg bg-[#1f2937] py-2">
                  <Text className="text-xs font-semibold text-gray-400">
                    {listing.status === 'SOLD' ? 'Sold' : 'No longer available'}
                  </Text>
                </View>
              )}
              <TouchableOpacity
                onPress={() => void shareListing(listing)}
                className="items-center justify-center rounded-lg bg-[#1f2937] px-3"
                accessibilityRole="button"
                accessibilityLabel={`Share ${listing.title}`}
              >
                <Ionicons name="share-social-outline" size={16} color="#d1d5db" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  const visibleCategories = showAllCategories ? BECHO_CATEGORIES : BECHO_CATEGORIES.slice(0, 7);
  const announcementTone =
    announcement?.severity === 'urgent'
      ? 'border-red-400/30 bg-red-500/10'
      : announcement?.severity === 'warning'
        ? 'border-amber-400/30 bg-amber-500/10'
        : 'border-sky-400/30 bg-sky-500/10';
  const announcementIcon =
    announcement?.severity === 'urgent' || announcement?.severity === 'warning'
      ? 'warning-outline'
      : announcement?.severity === 'success'
        ? 'checkmark-circle-outline'
        : 'information-circle-outline';
  const announcementColor =
    announcement?.severity === 'urgent'
      ? '#fca5a5'
      : announcement?.severity === 'warning'
        ? '#fcd34d'
        : announcement?.severity === 'success'
          ? '#86efac'
          : '#7dd3fc';
  const header = (
    <View className="pb-3">
      {announcement && announcement.id !== dismissedAnnouncementId && (
        <View className={`mx-4 mb-3 flex-row items-start rounded-2xl border p-3 ${announcementTone}`}>
          <Ionicons name={announcementIcon} size={19} color={announcementColor} />
          <View className="mx-2 flex-1">
            <Text className="text-sm font-bold text-white">{announcement.title}</Text>
            <Text className="mt-1 text-xs leading-5 text-gray-200">{announcement.body}</Text>
          </View>
          <TouchableOpacity
            onPress={() => setDismissedAnnouncementId(announcement.id)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss announcement"
            hitSlop={8}
          >
            <Ionicons name="close" size={17} color="#d1d5db" />
          </TouchableOpacity>
        </View>
      )}

      <TourTarget id="home-search" style={{ marginHorizontal: 16 }}>
        <View
          className="flex-row items-center rounded-xl border px-3"
          style={{ backgroundColor: theme.surface, borderColor: theme.border }}
        >
          <Ionicons name="search-outline" size={19} color={BECHO_COLORS.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('searchListings')}
            placeholderTextColor={BECHO_COLORS.textMuted}
            className="h-12 flex-1 px-3 text-sm text-white"
            returnKeyType="search"
            accessibilityLabel="Search listings"
          />
          {!!searchQuery && (
            <TouchableOpacity onPress={() => setSearchQuery('')} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={BECHO_COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </TourTarget>

      <View className="mt-3 flex-row px-4">
        <TourTarget id="home-offer-type" style={{ flexDirection: 'row' }}>
            {([
              ['ALL', t('all')],
              ['SELL', t('buy')],
              ['RENT', t('rent')],
            ] as const).map(([key, label]) => {
              const active = typeFilter === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => setTypeFilter(key)}
                  className={`mr-2 rounded-full px-4 py-2 ${active ? 'bg-emerald-500' : 'bg-[#1f2937]'}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text className={`text-xs font-bold ${active ? 'text-[#052e16]' : 'text-gray-300'}`}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </TourTarget>
        <View className="flex-1" />
        <TouchableOpacity
          onPress={() => setGridView((current) => !current)}
          className="h-9 w-9 items-center justify-center rounded-full bg-[#1f2937]"
          accessibilityRole="button"
          accessibilityLabel={gridView ? 'Switch to list view' : 'Switch to grid view'}
        >
          <Ionicons name={gridView ? 'list-outline' : 'grid-outline'} size={18} color="#d1d5db" />
        </TouchableOpacity>
      </View>

      <TourTarget id="home-categories" style={{ width: '100%' }}>
        <View className="mt-4 flex-row items-center justify-between px-4">
          <Text className="text-sm font-bold text-white">{t('browseCategories')}</Text>
          <TouchableOpacity onPress={() => setShowAllCategories((current) => !current)}>
            <Text className="text-xs font-semibold text-emerald-400">
              {showAllCategories ? t('showLess') : t('showAll')}
            </Text>
          </TouchableOpacity>
        </View>
        <View className="flex-row flex-wrap px-3 pt-2">
          {[
            { key: 'All', icon: 'apps-outline' as const },
            ...visibleCategories.map((category) => ({
              key: category,
              icon: CATEGORY_ICONS[category] ?? 'grid-outline',
            })),
          ].map(({ key, icon }) => {
            const active = selectedCategory === key;
            return (
              <View key={key} className="w-1/4 p-1">
                <TouchableOpacity
                  onPress={() => setSelectedCategory(key)}
                  className="min-h-[76px] items-center justify-center rounded-2xl border px-1.5 py-2"
                  style={{
                    backgroundColor: active ? `${theme.primary}1A` : theme.surface,
                    borderColor: active ? theme.primary : theme.border,
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons name={icon} size={21} color={active ? theme.primary : '#9ca3af'} />
                  <Text
                    className="mt-1.5 text-center text-[10px] font-semibold"
                    style={{ color: active ? theme.primary : '#d1d5db' }}
                    numberOfLines={1}
                  >
                    {key === 'All' ? t('categoryAll') : t(CATEGORY_TRANSLATION_KEYS[key] ?? 'browseCategories')}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      </TourTarget>

      {popularListings.length > 0 && (
        <View className="mt-4">
          <View className="mb-2 flex-row items-center justify-between px-4">
            <View>
              <Text className="text-sm font-bold text-white">{t('popularNearYou')}</Text>
              <Text className="mt-0.5 text-[11px] text-gray-500">{t('mostLiked')}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowMorePopular((current) => !current)}>
              <Text className="text-xs font-semibold text-emerald-400">
                {showMorePopular ? t('showLess') : t('showMore')}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 16 }}>
            {popularListings.slice(0, showMorePopular ? 8 : 4).map((listing) =>
              renderCard(listing, true)
            )}
          </ScrollView>
        </View>
      )}

      {recommendedListings.length > 0 && (
        <View className="mt-5">
          <View className="mb-2 flex-row items-center justify-between px-4">
            <View>
              <Text className="text-sm font-bold text-white">{t('recommended')}</Text>
              <Text className="mt-0.5 text-[11px] text-gray-500">{t('wellLiked')}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowMoreRecommended((current) => !current)}>
              <Text className="text-xs font-semibold" style={{ color: theme.primary }}>
                {showMoreRecommended ? t('showLess') : t('showMore')}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 16 }}>
            {recommendedListings.slice(0, showMoreRecommended ? 8 : 3).map((listing) =>
              renderCard(listing, true)
            )}
          </ScrollView>
        </View>
      )}

      {soldListings.length > 0 && (
        <View className="mt-5">
          <View className="mb-2 flex-row items-center justify-between px-4">
            <View>
              <Text className="text-sm font-bold text-white">{t('recentlySold')}</Text>
              <Text className="mt-0.5 text-[11px] text-gray-500">{t('popularFinds')}</Text>
            </View>
            <TouchableOpacity onPress={() => setShowMoreSold((current) => !current)}>
              <Text className="text-xs font-semibold" style={{ color: theme.primary }}>
                {showMoreSold ? t('showLess') : t('showMore')}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 16 }}>
            {soldListings.slice(0, showMoreSold ? 12 : 3).map((listing) =>
              renderCard(listing, true)
            )}
          </ScrollView>
        </View>
      )}

      <View className="mt-5 flex-row items-end justify-between px-4">
        <View>
          <Text className="text-sm font-bold text-white">
            {selectedCategory === 'All'
              ? t('latestListings')
              : t(CATEGORY_TRANSLATION_KEYS[selectedCategory] ?? 'latestListings')}
          </Text>
          <Text className="mt-0.5 text-xs text-gray-500">
            {loading
              ? t('updatingResults')
              : `${displayListings.length} ${displayListings.length === 1 ? t('result') : t('results')}`}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowFilters(true)}
          className="flex-row items-center rounded-full bg-[#1f2937] px-3 py-2"
          accessibilityRole="button"
          accessibilityLabel={t('filters')}
        >
          <Ionicons name="filter-outline" size={14} color="#d1d5db" />
          <Text className="ml-1.5 text-xs font-semibold text-gray-300">{t('filters')}</Text>
        </TouchableOpacity>
      </View>

      {!!(featureMessage || settingsError) && (
        <View className="mx-4 mt-3 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2">
          <Text className="text-xs text-amber-200">{featureMessage || settingsError}</Text>
        </View>
      )}
      {!!errorMessage && (
        <View className="mx-4 mt-3 flex-row items-center justify-between rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2">
          <Text className="text-xs text-red-200">{errorMessage}</Text>
          <TouchableOpacity
            onPress={() => void fetchListings(true)}
            disabled={refreshing}
            className="ml-3 rounded-full bg-red-400/15 px-3 py-1.5"
            accessibilityRole="button"
            accessibilityLabel={t('retry')}
          >
            <Text className="text-xs font-semibold text-red-100">{t('retry')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: theme.background }}>
      {loading && listings.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={theme.primary} />
          <Text className="mt-3 text-sm text-gray-400">Finding good picks nearby…</Text>
        </View>
      ) : (
        <FlatList
          key={gridView ? 'grid' : 'list'}
          data={displayListings}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderCard(item)}
          numColumns={gridView ? 2 : 1}
          columnWrapperStyle={gridView ? { justifyContent: 'space-between', paddingHorizontal: 16 } : undefined}
          contentContainerStyle={{ paddingBottom: 28 }}
          ListHeaderComponent={header}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void fetchListings(true)}
              tintColor={theme.primary}
            />
          }
          ListEmptyComponent={
            <View className="items-center px-8 py-12">
              <Ionicons name="search-outline" size={36} color={BECHO_COLORS.textMuted} />
              <Text className="mt-3 text-base font-bold text-white">{t('noListings')}</Text>
              <Text className="mt-1 text-center text-sm text-gray-400">
                {t('clearSearch')}
              </Text>
            </View>
          }
        />
      )}

      <Modal
        visible={showFilters}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilters(false)}
      >
        <View className="flex-1 justify-end bg-black/60">
          <TouchableOpacity className="flex-1" onPress={() => setShowFilters(false)} />
          <View
            className="rounded-t-3xl border-t px-5 pb-8 pt-5"
            style={{
              backgroundColor: theme.surface,
              borderColor: theme.border,
              maxHeight: '85%',
            }}
          >
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View className="mb-5 flex-row items-center justify-between">
              <View>
                <Text className="text-lg font-bold text-white">{t('filterListings')}</Text>
                <Text className="mt-1 text-xs text-gray-400">{t('narrowLocalResults')}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowFilters(false)} accessibilityLabel="Close filters">
                <Ionicons name="close" size={22} color="#d1d5db" />
              </TouchableOpacity>
            </View>
            <Text className="mb-2 text-xs font-semibold text-gray-300">{t('listingType')}</Text>
            <View className="mb-4 flex-row">
              {([
                ['ALL', t('all')],
                ['SELL', t('sell')],
                ['RENT', t('rent')],
              ] as const).map(([key, label]) => {
                const active = typeFilter === key;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setTypeFilter(key)}
                    className="mr-2 flex-1 items-center rounded-xl border py-3"
                    style={{
                      backgroundColor: active ? `${theme.primary}1A` : theme.background,
                      borderColor: active ? theme.primary : theme.border,
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text className="text-xs font-bold" style={{ color: active ? theme.primary : '#d1d5db' }}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text className="mb-2 text-xs font-semibold text-gray-300">{t('sortBy')}</Text>
            <View className="mb-4 flex-row flex-wrap">
              {([
                ['newest', t('newest')],
                ['price_asc', t('priceLowHigh')],
                ['price_desc', t('priceHighLow')],
              ] as const).map(([key, label]) => {
                const active = sortOrder === key;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setSortOrder(key)}
                    className="mr-2 mb-2 rounded-full border px-3 py-2"
                    style={{
                      backgroundColor: active ? `${theme.primary}1A` : theme.background,
                      borderColor: active ? theme.primary : theme.border,
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text className="text-[11px] font-semibold" style={{ color: active ? theme.primary : '#d1d5db' }}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text className="mb-2 text-xs font-semibold text-gray-300">{t('priceRange')}</Text>
            <View className="mb-4 flex-row">
              <TextInput
                value={minPrice}
                onChangeText={setMinPrice}
                placeholder={t('minimum')}
                placeholderTextColor={BECHO_COLORS.textMuted}
                keyboardType="numeric"
                className="mr-2 h-12 flex-1 rounded-xl border px-3 text-white"
                style={{ backgroundColor: theme.background, borderColor: theme.border }}
                accessibilityLabel="Minimum price"
              />
              <TextInput
                value={maxPrice}
                onChangeText={setMaxPrice}
                placeholder={t('maximum')}
                placeholderTextColor={BECHO_COLORS.textMuted}
                keyboardType="numeric"
                className="h-12 flex-1 rounded-xl border px-3 text-white"
                style={{ backgroundColor: theme.background, borderColor: theme.border }}
                accessibilityLabel="Maximum price"
              />
            </View>
            <Text className="mb-2 text-xs font-semibold text-gray-300">{t('city')}</Text>
            <TextInput
              value={cityFilter}
              onChangeText={setCityFilter}
              placeholder={t('anyCity')}
              placeholderTextColor={BECHO_COLORS.textMuted}
              className="mb-4 h-12 rounded-xl border px-3 text-white"
              style={{ backgroundColor: theme.background, borderColor: theme.border }}
              accessibilityLabel="Filter by city"
            />
            <View
              className="mb-4 flex-row items-center justify-between rounded-xl border px-3 py-2.5"
              style={{ backgroundColor: theme.background, borderColor: theme.border }}
            >
              <View className="flex-1 pr-3">
                <Text className="text-sm font-semibold text-gray-200">{t('verifiedOnly')}</Text>
                <Text className="mt-0.5 text-[11px] text-gray-500">{t('hideUnverified')}</Text>
              </View>
              <Switch
                value={verifiedOnly}
                onValueChange={setVerifiedOnly}
                trackColor={{ true: theme.primary, false: '#374151' }}
                thumbColor="#f9fafb"
                accessibilityLabel={t('verifiedOnly')}
              />
            </View>
            <View className="flex-row">
              <TouchableOpacity
                onPress={() => {
                  setMinPrice('');
                  setMaxPrice('');
                  setCityFilter('');
                  setTypeFilter('ALL');
                  setSortOrder('newest');
                  setVerifiedOnly(false);
                }}
                className="mr-3 flex-1 items-center rounded-xl border py-3"
                style={{ borderColor: theme.border }}
              >
                <Text className="font-semibold text-gray-300">{t('clear')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowFilters(false)}
                className="flex-1 items-center rounded-xl py-3"
                style={{ backgroundColor: theme.primary }}
              >
                <Text className="font-bold text-[#052e16]">
                  {t('showResults')} {displayListings.length}{' '}
                  {displayListings.length === 1 ? t('result') : t('results')}
                </Text>
              </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
